import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';

export type OverlayBarData = {
  start: number;
  end: number;
  color: string;
  label: string;
  upDirection: boolean;
  name: string;
};

const OverlayBar = ({ data }: { data: OverlayBarData[] }) => {
  const minStart = Math.min(...data.map((d) => d.start));
  const maxEnd = Math.max(...data.map((d) => d.end));
  const range = maxEnd - minStart;

  return (
    <div className="flex flex-col">
      {data.map((segment) => {
        const left = ((segment.start - minStart) / range) * 100;
        const right = ((segment.end - minStart) / range) * 100;
        const segmentWidth = right - left;

        return (
          <div key={segment.name} className="relative h-[30px] w-full">
            <Tooltip>
              <TooltipTrigger asChild>
                <div
                  className="absolute bottom-0 h-full transition-all"
                  style={{
                    left: `${left}%`,
                    width: `${segmentWidth}%`,
                    backgroundColor: segment.color,
                    opacity: 0.8,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                <div>
                  <p>{segment.label}</p>
                  <p>
                    {`${segment.upDirection ? '+' : '-'}`}
                    {(segment.end - segment.start).toFixed(2)}
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>
          </div>
        );
      })}
    </div>
  );
};

export default OverlayBar;
