import { Splitter, CodeChunk } from './index';

/**
 * Markdown-aware splitter that uses a real Markdown AST (mdast) produced by
 * `unified` + `remark-parse`. Documents are split on heading boundaries and
 * thematic breaks (`---`), so each chunk is a self-contained section. The
 * heading hierarchy (e.g. "Title > Section > Subsection") is stored in the
 * chunk metadata to give the embedding model extra context.
 *
 * remark is ESM-only. To keep it working both in the CommonJS `core` build and
 * inside the webpack-bundled VSCode extension, we load it through a *native*
 * dynamic import that webpack does not statically analyse. If the import fails
 * (e.g. dependencies not shipped), we transparently fall back to the recursive
 * character splitter.
 */

// `new Function` hides the import() from webpack's static analysis so it stays a
// real runtime ESM import resolved from node_modules instead of being bundled.
const nativeImport: (m: string) => Promise<any> = new Function('m', 'return import(m)') as any;

interface MarkdownNode {
    type: string;
    depth?: number;
    position?: {
        start: { line: number; column: number; offset?: number };
        end: { line: number; column: number; offset?: number };
    };
    children?: MarkdownNode[];
}

interface MarkdownSection {
    startLine: number; // 1-based
    endLine: number;   // 1-based
    headingPath: string[];
}

export class MarkdownSplitter implements Splitter {
    private chunkSize: number = 2500;
    private chunkOverlap: number = 300;
    private processor: any = null;
    private remarkUnavailable = false;
    private fallback: any;

    constructor(chunkSize?: number, chunkOverlap?: number) {
        if (chunkSize) this.chunkSize = chunkSize;
        if (chunkOverlap) this.chunkOverlap = chunkOverlap;

        const { RecursiveCharacterSplitter } = require('./recursive-splitter');
        this.fallback = new RecursiveCharacterSplitter(chunkSize, chunkOverlap);
    }

    setChunkSize(chunkSize: number): void {
        this.chunkSize = chunkSize;
        this.fallback.setChunkSize(chunkSize);
    }

    setChunkOverlap(chunkOverlap: number): void {
        this.chunkOverlap = chunkOverlap;
        this.fallback.setChunkOverlap(chunkOverlap);
    }

    static isLanguageSupported(language: string): boolean {
        const lang = language.toLowerCase();
        return lang === 'markdown' || lang === 'md';
    }

    private async getProcessor(): Promise<any> {
        if (this.processor || this.remarkUnavailable) {
            return this.processor;
        }
        try {
            const { unified } = await nativeImport('unified');
            const remarkParse = (await nativeImport('remark-parse')).default;
            this.processor = unified().use(remarkParse);
            return this.processor;
        } catch (error) {
            console.warn('[MarkdownSplitter] ⚠️  remark/unified not available, falling back to recursive splitter:', error);
            this.remarkUnavailable = true;
            return null;
        }
    }

    async split(code: string, language: string, filePath?: string): Promise<CodeChunk[]> {
        const processor = await this.getProcessor();
        if (!processor) {
            return this.fallback.split(code, 'markdown', filePath);
        }

        try {
            const tree: MarkdownNode = processor.parse(code);
            const lines = code.split('\n');
            const sections = this.buildSections(tree, lines.length);

            const chunks: CodeChunk[] = [];
            for (const section of sections) {
                const content = lines.slice(section.startLine - 1, section.endLine).join('\n');
                if (!content.trim()) {
                    continue;
                }
                const base: CodeChunk = {
                    content,
                    metadata: {
                        startLine: section.startLine,
                        endLine: section.endLine,
                        language,
                        filePath,
                        ...(section.headingPath.length > 0 ? { heading: section.headingPath.join(' > ') } : {})
                    } as CodeChunk['metadata']
                };
                chunks.push(...this.refineSection(base));
            }

            if (chunks.length === 0) {
                return this.fallback.split(code, 'markdown', filePath);
            }
            return chunks;
        } catch (error) {
            console.warn(`[MarkdownSplitter] ⚠️  Failed to split markdown for ${filePath || 'unknown'}, falling back to recursive splitter:`, error);
            return this.fallback.split(code, 'markdown', filePath);
        }
    }

    /**
     * Walk the top-level mdast nodes and group them into sections. A new section
     * starts at every heading and after every thematic break (`---`).
     */
    private buildSections(tree: MarkdownNode, totalLines: number): MarkdownSection[] {
        const blocks = (tree.children || []).filter(n => n.position);
        const sections: MarkdownSection[] = [];
        const headingStack: { depth: number; text: string }[] = [];

        let current: MarkdownSection | null = null;

        const closeCurrent = (endLine: number) => {
            if (current) {
                current.endLine = Math.max(current.startLine, endLine);
                sections.push(current);
                current = null;
            }
        };

        for (const node of blocks) {
            const startLine = node.position!.start.line;
            const endLine = node.position!.end.line;

            if (node.type === 'heading') {
                closeCurrent(startLine - 1);
                const depth = node.depth || 1;
                while (headingStack.length && headingStack[headingStack.length - 1].depth >= depth) {
                    headingStack.pop();
                }
                headingStack.push({ depth, text: this.collectText(node) });
                current = {
                    startLine,
                    endLine,
                    headingPath: headingStack.map(h => h.text)
                };
            } else if (node.type === 'thematicBreak') {
                // End the current section at the divider; the divider itself is dropped.
                closeCurrent(startLine - 1);
            } else {
                if (!current) {
                    current = {
                        startLine,
                        endLine,
                        headingPath: headingStack.map(h => h.text)
                    };
                } else {
                    current.endLine = endLine;
                }
            }
        }

        closeCurrent(totalLines);
        return sections;
    }

    private collectText(node: MarkdownNode): string {
        if ((node as any).value) {
            return String((node as any).value);
        }
        if (node.children) {
            return node.children.map(c => this.collectText(c)).join('').trim();
        }
        return '';
    }

    /**
     * Split sections that exceed chunkSize into smaller line-based chunks while
     * preserving line numbers and heading metadata.
     */
    private refineSection(chunk: CodeChunk): CodeChunk[] {
        if (chunk.content.length <= this.chunkSize) {
            return [chunk];
        }

        const lines = chunk.content.split('\n');
        const result: CodeChunk[] = [];
        let buffer = '';
        let startLine = chunk.metadata.startLine;
        let count = 0;

        for (let i = 0; i < lines.length; i++) {
            const piece = i === lines.length - 1 ? lines[i] : lines[i] + '\n';
            if (buffer.length + piece.length > this.chunkSize && buffer.length > 0) {
                result.push({
                    content: buffer.replace(/\n$/, ''),
                    metadata: { ...chunk.metadata, startLine, endLine: startLine + count - 1 }
                });
                buffer = piece;
                startLine = chunk.metadata.startLine + i;
                count = 1;
            } else {
                buffer += piece;
                count++;
            }
        }

        if (buffer.trim().length > 0) {
            result.push({
                content: buffer.replace(/\n$/, ''),
                metadata: { ...chunk.metadata, startLine, endLine: startLine + count - 1 }
            });
        }

        return result;
    }
}
