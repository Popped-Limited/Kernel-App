import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/kernel.png" alt="Kernel" className="h-16 w-auto mb-4" />
      <h1 className="text-2xl font-bold text-gray-900">Page not found</h1>
      <p className="mt-2 text-sm text-gray-500">The page you're looking for doesn't exist.</p>
      <Link href="/dashboard" className="btn-primary mt-6">
        Back to Dashboard
      </Link>
    </div>
  );
}
