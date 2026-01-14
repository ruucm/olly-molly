'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface ResizablePaneProps {
    left: React.ReactNode;
    right: React.ReactNode;
    defaultLeftWidth?: number;
    minLeftWidth?: number;
    minRightWidth?: number;
}

export function ResizablePane({
    left,
    right,
    defaultLeftWidth = 60, // percentage
    minLeftWidth = 30,
    minRightWidth = 25,
}: ResizablePaneProps) {
    const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Update leftWidth when defaultLeftWidth changes
    useEffect(() => {
        setLeftWidth(defaultLeftWidth);
    }, [defaultLeftWidth]);

    const handleMouseDown = () => {
        setIsDragging(true);
    };

    const handleMouseMove = useCallback(
        (e: MouseEvent) => {
            if (!isDragging || !containerRef.current) return;

            const containerRect = containerRef.current.getBoundingClientRect();
            const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

            // Apply constraints
            const constrainedWidth = Math.max(
                minLeftWidth,
                Math.min(100 - minRightWidth, newLeftWidth)
            );

            setLeftWidth(constrainedWidth);
        },
        [isDragging, minLeftWidth, minRightWidth]
    );

    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';

            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };
        }
    }, [isDragging, handleMouseMove, handleMouseUp]);

    return (
        <div ref={containerRef} className="flex h-full overflow-hidden">
            {/* Left Pane */}
            <div
                style={{ width: `${leftWidth}%` }}
                className="overflow-auto flex-shrink-0"
            >
                {left}
            </div>

            {/* Resizer */}
            <div
                onMouseDown={handleMouseDown}
                className={`w-1 bg-primary hover:bg-indigo-500 cursor-col-resize flex-shrink-0 transition-colors ${isDragging ? 'bg-indigo-500' : ''
                    }`}
            />

            {/* Right Pane */}
            <div
                style={{ width: `${100 - leftWidth}%` }}
                className="overflow-hidden flex-shrink-0"
            >
                {right}
            </div>
        </div>
    );
}
