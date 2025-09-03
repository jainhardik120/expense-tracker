const Layout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center p-4">
      <div className="min-w-sm">{children}</div>
    </div>
  );
};

export default Layout;
