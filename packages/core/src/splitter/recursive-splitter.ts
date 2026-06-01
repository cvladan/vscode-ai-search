import { Splitter, CodeChunk } from './index';

/**
 * Dependency-free recursive character text splitter.
 *
 * This is the universal fallback used when the AST splitter cannot handle a file
 * (unsupported language, parse error, or an AST node larger than `chunkSize`).
 * It works like a classic "recursive character" splitter: it tries a list of
 * separators from coarse to fine (paragraph → line → word → character) and packs
 * the resulting pieces into chunks of at most `chunkSize` characters, with
 * `chunkOverlap` characters of overlap between neighbours.
 *
 * It replaces the previous LangChain-based splitter so the project carries no
 * heavy `langchain` / `@langchain/core` dependency tree.
 */

// Coarse-to-fine separator presets. The defaults work for any text; a few
// language families get hints that keep logical units (functions/classes,
// headings, tags) together when possible.
const DEFAULT_SEPARATORS = ['\n\n', '\n', ' ', ''];

const LANGUAGE_SEPARATORS: Record<string, string[]> = {
    // C-family / general purpose programming languages
    code: ['\nclass ', '\nfunction ', '\ndef ', '\n\tdef ', '\nfunc ', '\nfn ', '\n\n', '\n', ' ', ''],
    python: ['\nclass ', '\ndef ', '\n\tdef ', '\n\n', '\n', ' ', ''],
    markdown: ['\n## ', '\n### ', '\n#### ', '\n##### ', '\n# ', '\n---\n', '\n\n', '\n', ' ', ''],
    html: ['\n<div', '\n<section', '\n<p', '\n<br', '\n\n', '\n', ' ', ''],
    latex: ['\n\\chapter', '\n\\section', '\n\\subsection', '\n\n', '\n', ' ', ''],
};

const CODE_LANGUAGES = new Set([
    'javascript', 'js', 'typescript', 'ts', 'java', 'cpp', 'c++', 'c', 'go',
    'rust', 'rs', 'php', 'ruby', 'rb', 'swift', 'scala', 'csharp', 'cs',
    'kotlin', 'dart', 'solidity', 'sol', 'proto'
]);

export class RecursiveCharacterSplitter implements Splitter {
    private chunkSize: number = 1000;
    private chunkOverlap: number = 200;

    constructor(chunkSize?: number, chunkOverlap?: number) {
        if (chunkSize) this.chunkSize = chunkSize;
        if (chunkOverlap) this.chunkOverlap = chunkOverlap;
    }

    setChunkSize(chunkSize: number): void {
        this.chunkSize = chunkSize;
    }

    setChunkOverlap(chunkOverlap: number): void {
        this.chunkOverlap = chunkOverlap;
    }

    async split(code: string, language: string, filePath?: string): Promise<CodeChunk[]> {
        const separators = this.getSeparators(language);
        const pieces = this.splitText(code, separators).filter(p => p.trim().length > 0);

        const chunks: CodeChunk[] = [];
        let searchFrom = 0;
        for (const piece of pieces) {
            const { start, end } = this.estimateLines(code, piece, searchFrom);
            // advance the search cursor so repeated content maps to later lines
            const idx = code.indexOf(piece, searchFrom);
            if (idx !== -1) {
                searchFrom = idx + Math.max(1, piece.length - this.chunkOverlap);
            }
            chunks.push({
                content: piece,
                metadata: { startLine: start, endLine: end, language, filePath }
            });
        }

        if (chunks.length === 0) {
            chunks.push({
                content: code,
                metadata: { startLine: 1, endLine: code.split('\n').length, language, filePath }
            });
        }
        return chunks;
    }

    private getSeparators(language: string): string[] {
        const lang = (language || '').toLowerCase();
        if (LANGUAGE_SEPARATORS[lang]) return LANGUAGE_SEPARATORS[lang];
        if (lang === 'md') return LANGUAGE_SEPARATORS.markdown;
        if (lang === 'py') return LANGUAGE_SEPARATORS.python;
        if (CODE_LANGUAGES.has(lang)) return LANGUAGE_SEPARATORS.code;
        return DEFAULT_SEPARATORS;
    }

    /**
     * Recursively split text trying separators from coarse to fine.
     */
    private splitText(text: string, separators: string[]): string[] {
        const finalChunks: string[] = [];

        // Pick the first separator that actually occurs in the text.
        let separator = separators[separators.length - 1];
        let remainingSeparators: string[] = [];
        for (let i = 0; i < separators.length; i++) {
            const s = separators[i];
            if (s === '') { separator = s; break; }
            if (text.includes(s)) {
                separator = s;
                remainingSeparators = separators.slice(i + 1);
                break;
            }
        }

        const splits = separator === '' ? text.split('') : text.split(separator);

        const goodSplits: string[] = [];
        for (const part of splits) {
            if (part.length < this.chunkSize) {
                goodSplits.push(part);
            } else {
                if (goodSplits.length > 0) {
                    finalChunks.push(...this.mergeSplits(goodSplits, separator));
                    goodSplits.length = 0;
                }
                if (remainingSeparators.length === 0) {
                    finalChunks.push(part);
                } else {
                    finalChunks.push(...this.splitText(part, remainingSeparators));
                }
            }
        }
        if (goodSplits.length > 0) {
            finalChunks.push(...this.mergeSplits(goodSplits, separator));
        }
        return finalChunks;
    }

    /**
     * Pack small pieces into chunks up to chunkSize, keeping chunkOverlap between them.
     */
    private mergeSplits(splits: string[], separator: string): string[] {
        const sepLen = separator.length;
        const docs: string[] = [];
        const current: string[] = [];
        let total = 0;

        for (const part of splits) {
            const extra = current.length > 0 ? sepLen : 0;
            if (total + part.length + extra > this.chunkSize && current.length > 0) {
                const doc = current.join(separator);
                if (doc.trim().length > 0) docs.push(doc);

                // Drop from the front until we are back under the overlap budget.
                while (current.length > 0 &&
                       (total > this.chunkOverlap ||
                        (total + part.length + (current.length > 0 ? sepLen : 0) > this.chunkSize && total > 0))) {
                    total -= current[0].length + (current.length > 1 ? sepLen : 0);
                    current.shift();
                }
            }
            current.push(part);
            total += part.length + (current.length > 1 ? sepLen : 0);
        }

        const doc = current.join(separator);
        if (doc.trim().length > 0) docs.push(doc);
        return docs;
    }

    /**
     * Estimate 1-based start/end line numbers of a chunk within the original text.
     */
    private estimateLines(originalCode: string, chunk: string, searchFrom: number): { start: number; end: number } {
        const idx = originalCode.indexOf(chunk, searchFrom);
        const chunkLineCount = chunk.split('\n').length;
        if (idx === -1) {
            return { start: 1, end: chunkLineCount };
        }
        const before = originalCode.substring(0, idx);
        const start = before.split('\n').length;
        return { start, end: start + chunkLineCount - 1 };
    }
}
