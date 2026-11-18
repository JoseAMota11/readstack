'use client';

import { useTheme } from '@/context/theme.context';
import { DownOutlined, LogoutOutlined, MoonOutlined, SunOutlined, UserOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useEffect, useId, useRef, useState } from 'react';

function UserPanel({ onLogout, suspendDismiss = false, logoutButtonRef }: {
  onLogout: () => void;
  suspendDismiss?: boolean;
  logoutButtonRef?: React.Ref<HTMLButtonElement>;
}) {
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [rendered, setRendered] = useState(false);
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || suspendDismiss) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('keydown', dismissEscape);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('keydown', dismissEscape);
    };
  }, [open, suspendDismiss]);

  useEffect(() => {
    if (open || !rendered) return;
    const timeout = window.setTimeout(() => setRendered(false), 250);
    return () => window.clearTimeout(timeout);
  }, [open, rendered]);

  return (
    <div className="user-panel-container" ref={containerRef}>
      <Button
        ref={triggerRef}
        type="text"
        className="user-panel-trigger"
        aria-label="Menú de usuario"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (!open) setRendered(true);
          setOpen(!open);
        }}
      >
        <UserOutlined aria-hidden="true" />
        <DownOutlined className="user-panel-chevron" aria-hidden="true" />
      </Button>
      {rendered && (
        <div
          id={panelId}
          className="user-panel"
          data-state={open ? 'open' : 'closing'}
          aria-label="Menú de usuario"
          aria-hidden={!open}
          inert={!open}
          role="group"
          onTransitionEnd={(event) => {
            if (!open && event.target === event.currentTarget && event.propertyName === 'opacity') setRendered(false);
          }}
        >
          <div className="user-panel-theme">
            <div className="user-panel-theme-copy">
              <span className="user-panel-label">Modo oscuro</span>
              <span className="user-panel-current">{theme === 'dark' ? 'Activado' : 'Desactivado'}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-label="Modo oscuro"
              aria-checked={theme === 'dark'}
              className="user-panel-switch"
              onClick={toggleTheme}
            >
              <span className="user-panel-switch-icon"><SunOutlined aria-hidden="true" /></span>
              <span className="user-panel-switch-icon"><MoonOutlined aria-hidden="true" /></span>
              <span className="user-panel-switch-thumb" aria-hidden="true" />
            </button>
          </div>
          <Button ref={logoutButtonRef} type="text" className="user-panel-logout" onClick={onLogout}>
            <LogoutOutlined aria-hidden="true" />
            Cerrar sesión
          </Button>
        </div>
      )}
    </div>
  );
}

export default UserPanel;
