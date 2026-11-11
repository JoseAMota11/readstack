'use client';

import AuthIdentity from '@/components/auth-identity';
import AuthFieldError from '@/components/auth-field-error';
import { useMessage } from '@/context/message.context';
import { registerSchema } from '@/schemas/register.schema';
import { registerUser } from '@/services/register.service';
import { Register } from '@/types/register.type';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  Controller,
  FieldValues,
  SubmitHandler,
  useForm,
} from 'react-hook-form';

function RegisterPage() {
  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({ resolver: zodResolver(registerSchema) });
  const messageApi = useMessage();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const onValid: SubmitHandler<FieldValues> = async (values) => {
    try {
      setLoading(true);

      const { confirmPassword: _confirmPassword, ...rest } = values;
      const [error, message] = await registerUser(rest as Register);

      if (error) {
        messageApi.error(error);
        return;
      }

      messageApi.success(message);
      router.push('/login');
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
      <form
        method="post"
        onSubmit={handleSubmit(onValid)}
        className="auth-form"
      >
        <div className="auth-heading"><h1>Crea tu cuenta</h1><p>Empieza a organizar tu biblioteca personal.</p></div>
        <Controller
          name="username"
          control={control}
          render={({ field }) => (
            <div className="auth-field">
              <label htmlFor="username">Nombre de usuario</label>
                <Input
                  {...field}
                  id="username"
                  aria-invalid={!!errors.username}
                  aria-describedby={errors.username ? 'username-error' : undefined}
                  placeholder="example123"
                  size="large"
                  status={errors.username && 'error'}
                />
              {errors.username && (
                <AuthFieldError id="username-error">{errors.username.message as string}</AuthFieldError>
              )}
            </div>
          )}
        />
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
        <Controller
          name="confirmPassword"
          control={control}
          render={({ field }) => (
            <div className="auth-field">
              <label htmlFor="confirmPassword">Confirmar contraseña</label>
                <Input.Password
                  {...field}
                  id="confirmPassword"
                  aria-invalid={!!errors.confirmPassword}
                  aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined}

                  placeholder="******"
                  size="large"
                  status={errors.confirmPassword && 'error'}
                />
              {errors.confirmPassword && (
                <AuthFieldError id="confirmPassword-error">
                  {errors.confirmPassword.message as string}
                </AuthFieldError>
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
          Registrarse
        </Button>
        <div className="auth-alternate">¿Ya tienes una cuenta? <Link href="/login" className="auth-link">Inicia sesión</Link></div>
      </form>
        </div>
      </section>
    </main>
  );
}

export default RegisterPage;
