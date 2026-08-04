import { Skeleton } from './Skeleton';

export function PageLoader() {
  return (
    <div className="flex-grow w-full max-w-max-width mx-auto px-margin-mobile md:px-margin-desktop py-8 md:py-12 flex flex-col gap-8 h-[calc(100vh-80px)]">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6">
        <div className="w-full max-w-md">
          <Skeleton className="h-10 w-3/4 mb-4" />
          <Skeleton className="h-5 w-full" />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
      
      <div className="flex flex-col gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
