'use client';

import AuthIdentity from '@/components/auth-identity';
import AuthFieldError from '@/components/auth-field-error';
import { useMessage } from '@/context/message.context';
import { loginSchema } from '@/schemas/login.schema';
import { loginUser } from '@/services/login.service';
import { verifyLoginSession } from '@/services/login-session';
import { Login } from '@/types/login.type';
import { setToken } from '@/utils/cookies-handlers';
import { safeReturnPath } from '@/utils/session';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Controller,
  FieldValues,
  SubmitHandler,
  useForm,
} from 'react-hook-form';

function LoginPage() {
  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema) });
  const messageApi = useMessage();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [sessionState, setSessionState] = useState<'checking' | 'anonymous' | 'unavailable'>('checking');
  const checkRef = useRef<AbortController | null>(null);

  const checkSession = useCallback(async () => {
    checkRef.current?.abort();
    const controller = new AbortController();
    checkRef.current = controller;
    const timeout = window.setTimeout(() => {
      controller.abort();
      if (checkRef.current === controller) setSessionState('unavailable');
    }, 10000);
    controller.signal.addEventListener('abort', () => window.clearTimeout(timeout), { once: true });
    let result;
    do {
      result = await verifyLoginSession(controller.signal);
    } while (result === 'stale' && !controller.signal.aborted && checkRef.current === controller);
    window.clearTimeout(timeout);
    if (controller.signal.aborted || checkRef.current !== controller) return;
    if (result === 'authenticated') {
      router.replace(safeReturnPath(new URLSearchParams(window.location.search).get('returnTo')));
    } else if (result !== 'stale') {
      setSessionState(result);
    }
  }, [router]);

  useEffect(() => {
    void checkSession();
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setSessionState('checking');
        void checkSession();
      }
    };
    window.addEventListener('pageshow', onPageShow);
    return () => {
      checkRef.current?.abort();
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [checkSession]);

  const onValid: SubmitHandler<FieldValues> = async (values) => {
    try {
      setLoading(true);

      const [error, token] = await loginUser(values as Login);

      if (error) {
        messageApi.error(error);
        return;
      }

      if (token) {
        setToken(token);
        router.replace(safeReturnPath(new URLSearchParams(window.location.search).get('returnTo')));
      }
    } catch (err) {
      console.error(err);
      messageApi.error('Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="auth-page">
      <AuthIdentity />
      <section className="auth-content">
        <div className="auth-content-inner">
      <noscript>
        <style>{'#login-form { display: block !important; } #login-session-status { display: none !important; }'}</style>
        <p role="alert">Activa JavaScript para iniciar sesión.</p>
      </noscript>
      {sessionState === 'checking' && <p id="login-session-status" role="status">Comprobando sesión...</p>}
      {sessionState === 'unavailable' && (
        <div role="alert">
          <p>No se pudo comprobar la sesión.</p>
          <Button onClick={() => { setSessionState('checking'); void checkSession(); }}>Reintentar</Button>
          <Button onClick={() => setSessionState('anonymous')}>Iniciar sesión</Button>
        </div>
      )}
      <form
        id="login-form"
        style={{ display: sessionState === 'anonymous' ? undefined : 'none' }}
        method="post"
        onSubmit={handleSubmit(onValid)}
        className="auth-form"
      >
        <div className="auth-heading"><h1>Inicia sesión</h1><p>Accede a tu biblioteca personal.</p></div>
        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <div className="auth-field">
              <label htmlFor="email">Correo electrónico</label>
                <Input
                  {...field}
                  id="email"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}

                  placeholder="example@gmail.com"
                  size="large"
                  status={errors.email && 'error'}
                />
              {errors.email && (
                <AuthFieldError id="email-error">{errors.email.message as string}</AuthFieldError>
              )}
            </div>
          )}
        />
        <Controller
          name="password"
          control={control}
          render={({ field }) => (
            <div className="auth-field">
              <label htmlFor="password">Contraseña</label>
                <Input.Password
                  {...field}
                  id="password"
                  aria-invalid={!!errors.password}
                  aria-describedby={errors.password ? 'password-error' : undefined}

                  placeholder="******"
                  size="large"
                  status={errors.password && 'error'}
                />
              {errors.password && (
                <AuthFieldError id="password-error">{errors.password.message as string}</AuthFieldError>
              )}
            </div>
          )}
        />
        <Button
          type="primary"
          htmlType="submit"
          size="large"
          loading={loading}
          disabled={loading}
        >
          Iniciar sesión
        </Button>
        <div className="auth-alternate">¿No tienes una cuenta?
        <Link
          href="/register"
          className="auth-link"
        >
          Regístrate
        </Link></div>
      </form>
        </div>
      </section>
    </main>
  );
}

export default LoginPage;
