import { BookOutlined } from '@ant-design/icons';

export default function AuthIdentity() {
  return (
    <aside className="auth-identity">
      <div className="auth-brand"><BookOutlined aria-hidden="true" /> ReadStack</div>
      <div className="auth-identity-copy">
        <p className="auth-statement">Tu biblioteca,<br />a tu manera.</p>
        <p>Catalogar, organizar y reseñar libros en un solo lugar.</p>
      </div>
    </aside>
  );
}
