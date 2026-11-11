import { ExclamationCircleFilled } from '@ant-design/icons';
import { ReactNode } from 'react';

export default function AuthFieldError({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div className="auth-error" id={id}>
      <ExclamationCircleFilled aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}
