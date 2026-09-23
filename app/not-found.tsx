import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-950 text-slate-100">
      <h2 className="text-2xl font-bold mb-2">Page Not Found</h2>
      <p className="text-slate-400 mb-6">The requested resource could not be found.</p>
      <Link
        href="/"
        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
      >
        Return to AutoForge
      </Link>
    </div>
  );
}
