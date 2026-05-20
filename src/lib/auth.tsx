'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { auth, getToken, setToken, type AuthUser, ApiError } from './api';

const AUTH_PATHS = ['/login'];

interface AuthCtx {
    user: AuthUser | null;
    isLoading: boolean;
    isAuthenticated: boolean;
    login: (apiKey: string) => Promise<void>;
    logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const token = getToken();
        if (!token) {
            setIsLoading(false);
            return;
        }
        auth.me().then(setUser)
            .catch((err) => {
                if (err instanceof ApiError && err.status === 401) setToken(null);
            })
            .finally(() => setIsLoading(false));
    }, []);

    // Route protection — redirect unauth users off protected pages
    useEffect(() => {
        if (isLoading) return;
        const isAuthPage = AUTH_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
        if (!user && !isAuthPage) router.replace('/login');
        else if (user && isAuthPage) router.replace('/');
    }, [user, isLoading, pathname, router]);

    const login = useCallback(async (apiKey: string) => {
        const { token } = await auth.loginWithApiKey(apiKey);
        setToken(token);
        const me = await auth.me();
        setUser(me);
    }, []);

    const logout = useCallback(async () => {
        await auth.logout();
        setUser(null);
        router.replace('/login');
    }, [router]);

    return (
        <Ctx.Provider value={{ user, isLoading, isAuthenticated: !!user, login, logout }}>
            {children}
        </Ctx.Provider>
    );
}

export function useAuth(): AuthCtx {
    const v = useContext(Ctx);
    if (!v) throw new Error('useAuth must be used within AuthProvider');
    return v;
}
