import { BookOutlined } from '@ant-design/icons';

function LoadingStatus({ message, className }: { message: string; className?: string }) {
  return (
    <div className={className} role="status">
      <BookOutlined className="library-loading-icon" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export default LoadingStatus;
