import React from 'react';
import { cn } from '../lib/utils';

export const Card = React.forwardRef(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn('rounded-lg border border-border bg-surface text-text shadow-sm', className)}
        {...props}
    />
));
Card.displayName = 'Card';

export const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
    <div
        ref={ref}
        className={cn('flex flex-col space-y-1.5 p-6', className)}
        {...props}
    />
));
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
    <h3
        ref={ref}
        className={cn('text-2xl font-semibold leading-none tracking-tight text-primary', className)}
        {...props}
    />
));
CardTitle.displayName = 'CardTitle';

export const CardContent = React.forwardRef(({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
));
CardContent.displayName = 'CardContent';
