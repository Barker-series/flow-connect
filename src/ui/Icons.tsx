/** Stroked UI marks. One weight, one colour: the tubes own the palette. */

export function SparkGlyph({ small = false }: { small?: boolean }) {
    return <span className={`spark-glyph${small ? " small" : ""}`} aria-hidden="true" />;
}

export function UndoIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5 4 10l5 5" />
            <path d="M4 10h10a6 6 0 0 1 0 12h-3" />
        </svg>
    );
}

export function RestartIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M20 12a8 8 0 1 1-2.34-5.66" />
            <path d="M20 4v5h-5" />
        </svg>
    );
}

export function HintIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 18h6M10 21h4" />
            <path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z" />
        </svg>
    );
}

export function LockIcon() {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
    );
}

export function StarIcon({ filled = true }: { filled?: boolean }) {
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true" className={filled ? "filled" : ""}>
            <path d="m12 3 2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7Z" />
        </svg>
    );
}
