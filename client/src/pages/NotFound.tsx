import { Link } from 'react-router-dom';
import { Empty } from '../components/ui';

export default function NotFoundPage() {
  return (
    <div className="page">
      <Empty title="Page not found">
        <Link to="/dashboard">Go to dashboard</Link>
      </Empty>
    </div>
  );
}
