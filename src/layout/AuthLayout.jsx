import React from 'react';
import { Outlet } from 'react-router-dom';

export default function AuthLayout() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background py-12 px-4 sm:px-6 lg:px-8">
            <div className="w-full max-w-md space-y-8">
                <div className="text-center">
                    <h2 className="mt-6 text-3xl font-extrabold text-primary">
                        RF MUSIC
                    </h2>
                </div>
                <Outlet />
            </div>
        </div>
    );
}
