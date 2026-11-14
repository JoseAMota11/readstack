'use client';

import { useMessage } from '@/context/message.context';
import { removeToken } from '@/utils/cookies-handlers';
import { useRouter } from 'next/navigation';
import UserPanel from './user-panel';

function Navbar() {
  const router = useRouter();
  const messageApi = useMessage();

  const handleLogout = () => {
    removeToken();
    router.push('/login');

    messageApi.info('Cierre de sesión satisfactorio.');
  };

  return (
    <nav className="library-nav" aria-label="Navegación principal">
      <div className="library-brand">
        <span>ReadStack</span>
        <span className="library-beta-badge">BETA</span>
      </div>
      <div className="library-nav-actions">
        <UserPanel onLogout={handleLogout} />
      </div>
    </nav>
  );
}

export default Navbar;
