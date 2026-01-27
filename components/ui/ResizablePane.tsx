'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface ResizablePaneProps {
    left: React.ReactNode;
    right: React.ReactNode;
    defaultLeftWidth?: number;
    minLeftWidth?: number;
    minRightWidth?: number;
    mobileView?: 'left' | 'right' | 'stack';
}

export function ResizablePane({
    left,
    right,
    defaultLeftWidth = 60, // percentage
    minLeftWidth = 30,
    minRightWidth = 25,
    mobileView = 'left',
}: ResizablePaneProps) {
    const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
    const [isDragging, setIsDragging] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Check for mobile
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

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

    // Mobile view
    if (isMobile) {
        if (mobileView === 'stack') {
            return (
                <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
                    <div className="flex-1 overflow-auto min-h-0">{left}</div>
                    <div className="flex-1 overflow-auto min-h-0 border-t border-[var(--border-primary)]">{right}</div>
                </div>
            );
        }
        return (
            <div ref={containerRef} className="h-full overflow-hidden">
                {mobileView === 'left' ? left : right}
            </div>
        );
    }

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
