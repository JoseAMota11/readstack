'use client';

import ErrorMessage from '@/components/error-message';
import { useMessage } from '@/context/message.context';
import { loginSchema } from '@/schemas/login.schema';
import { loginUser } from '@/services/login.service';
import { Login } from '@/types/login.type';
import { setToken } from '@/utils/cookies-handlers';
import { safeReturnPath } from '@/utils/session';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
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

function LoginPage() {
  const {
    handleSubmit,
    control,
    formState: { errors },
  } = useForm({ resolver: zodResolver(loginSchema) });
  const messageApi = useMessage();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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
        router.push(safeReturnPath(new URLSearchParams(window.location.search).get('returnTo')));
      }
    } catch (err) {
      console.error(err);
      messageApi.error('Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen grid place-content-center">
      <form
        method="post"
        onSubmit={handleSubmit(onValid)}
        className="w-[360px] bg-white p-4 rounded-lg shadow-lg flex flex-col gap-4 max-[400px]:w-full"
      >
        <h2 className="text-center text-xl font-semibold">Inicia sesión</h2>
        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <div>
              <div className="flex items-center gap-3">
                <MailOutlined style={{ color: '#737373', fontSize: 18 }} />
                <Input
                  {...field}
                  id="email"
                  placeholder="example@gmail.com"
                  size="large"
                  status={errors.email && 'error'}
                />
              </div>
              {errors.email && (
                <ErrorMessage>{errors.email.message as string}</ErrorMessage>
              )}
            </div>
          )}
        />
        <Controller
          name="password"
          control={control}
          render={({ field }) => (
            <div>
              <div className="flex items-center gap-3">
                <LockOutlined style={{ color: '#737373', fontSize: 18 }} />
                <Input.Password
                  {...field}
                  id="password"
                  placeholder="******"
                  size="large"
                  status={errors.password && 'error'}
                />
              </div>
              {errors.password && (
                <ErrorMessage>{errors.password.message as string}</ErrorMessage>
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
        <div className="w-full h-[1px] bg-neutral-200" />
        <Link
          href="/register"
          className="h-10 rounded-lg flex items-center justify-center text-white bg-[#42b72a] hover:bg-[#4bc735]"
        >
          Regístrate
        </Link>
      </form>
    </div>
  );
}

export default LoginPage;
