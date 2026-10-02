// Re-mounts on every navigation inside /app, giving each page a quiet fade-in.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in h-full">{children}</div>;
}
