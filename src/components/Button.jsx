import React from 'react';
import { cn } from '../lib/utils';
import { LoaderCircle } from 'lucide-react';

export const Button = React.forwardRef(({ className, variant = 'primary', size = 'default', isLoading, children, ...props }, ref) => {
    const variants = {
        primary: 'bg-primary text-black hover:bg-primary-hover shadow-[0_0_15px_rgba(212,175,55,0.3)]',
        secondary: 'bg-surface border border-border text-text hover:bg-white/10',
        outline: 'border border-primary text-primary hover:bg-primary/10',
        ghost: 'hover:bg-white/10 text-text',
        link: 'text-primary underline-offset-4 hover:underline',
    };

    const sizes = {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 px-3',
        lg: 'h-11 px-8',
        icon: 'h-10 w-10',
    };

    return (
        <button
            ref={ref}
            className={cn(
                'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50',
                variants[variant],
                sizes[size],
                className
            )}
            disabled={isLoading}
            {...props}
        >
            {isLoading && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            {children}
        </button>
    );
});

Button.displayName = 'Button';
