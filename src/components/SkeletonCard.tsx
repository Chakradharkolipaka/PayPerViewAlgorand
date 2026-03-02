import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";

export default function SkeletonCard() {
  return (
    <Card className="overflow-hidden animate-pulse">
      <CardHeader className="p-0">
        <div className="w-full h-64 bg-secondary"></div>
      </CardHeader>
      <CardContent className="p-4 space-y-2">
        <div className="h-6 w-3/4 bg-secondary rounded"></div>
        <div className="h-4 w-full bg-secondary rounded"></div>
        <div className="h-3 w-1/2 bg-secondary rounded"></div>
      </CardContent>
      <CardFooter className="p-4 bg-muted/50">
        <div className="h-8 w-full bg-secondary rounded"></div>
      </CardFooter>
    </Card>
  );
}
