import React from 'react';

// Abre/fecha com altura animada (grid 0fr -> 1fr), sem medir a altura em JS.
export default function Collapse({ open, children }) {
    return (
        <div
            className="grid transition-[grid-template-rows,opacity] duration-[650ms] ease-[cubic-bezier(0.45,0,0.25,1)]"
            style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
            aria-hidden={!open}
            inert={!open}
        >
            <div className="min-h-0 overflow-hidden">{children}</div>
        </div>
    );
}
