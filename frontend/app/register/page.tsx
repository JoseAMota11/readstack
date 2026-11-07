'use client';

import ErrorMessage from '@/components/error-message';
import { useMessage } from '@/context/message.context';
import { registerSchema } from '@/schemas/register.schema';
import { registerUser } from '@/services/register.service';
import { Register } from '@/types/register.type';
import { LockOutlined, MailOutlined, UserOutlined } from '@ant-design/icons';
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
    <div className="h-screen grid place-content-center">
      <form
        method="post"
        onSubmit={handleSubmit(onValid)}
        className="w-[360px] bg-white p-4 rounded-lg shadow-lg flex flex-col gap-4 max-[400px]:w-full"
      >
        <h2 className="text-center text-xl font-semibold">Regístrate</h2>
        <Controller
          name="username"
          control={control}
          render={({ field }) => (
            <div>
              <div className="flex items-center gap-3">
                <UserOutlined style={{ color: '#737373', fontSize: 18 }} />
                <Input
                  {...field}
                  placeholder="example123"
                  size="large"
                  status={errors.username && 'error'}
                />
              </div>
              {errors.username && (
                <ErrorMessage>{errors.username.message as string}</ErrorMessage>
              )}
            </div>
          )}
        />
        <Controller
          name="email"
          control={control}
          render={({ field }) => (
            <div>
              <div className="flex items-center gap-3">
                <MailOutlined style={{ color: '#737373', fontSize: 18 }} />
                <Input
                  {...field}
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
        <Controller
          name="confirmPassword"
          control={control}
          render={({ field }) => (
            <div>
              <div className="flex items-center gap-3">
                <LockOutlined style={{ color: '#737373', fontSize: 18 }} />
                <Input.Password
                  {...field}
                  id="confirmPassword"
                  placeholder="******"
                  size="large"
                  status={errors.confirmPassword && 'error'}
                />
              </div>
              {errors.confirmPassword && (
                <ErrorMessage>
                  {errors.confirmPassword.message as string}
                </ErrorMessage>
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
        <Link href="/login" className="text-center text-blue-400 underline">
          ¿Ya tienes una cuenta?
        </Link>
      </form>
    </div>
  );
}

export default RegisterPage;
