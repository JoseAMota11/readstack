import { BookOutlined } from '@ant-design/icons';
import ThemeSwitcher from './theme-switcher';

export default function AuthIdentity({ editorial = false }: { editorial?: boolean }) {
  return (
    <aside className="auth-identity">
      <div className="auth-identity-header">
        <div className="auth-brand">
          <BookOutlined aria-hidden="true" /> ReadStack
          <span className="library-beta-badge">BETA</span>
        </div>
        <ThemeSwitcher />
      </div>
      <div className="auth-identity-copy">
        {editorial ? (
          <div className="auth-editorial">
            <p>Biblioteca personal</p>
            <span className="auth-editorial-rule" aria-hidden="true" />
          </div>
        ) : null}
        <p className="auth-statement">Tu biblioteca,{' '}<br />a tu manera.</p>
        <p>Catalogar, organizar y reseñar libros en un solo lugar.</p>
      </div>
    </aside>
  );
}
