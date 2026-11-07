import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { TriangleAlertIcon } from 'lucide-react'
import { Badge } from '@/components/reui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { INLET_LIMIT_C, INLET_WARN_C, PREVIEW_INLET } from './sample'

const chartConfig = {
  temp: { label: 'Inlet', color: 'var(--chart-1)' },
} satisfies ChartConfig

function barColor(t: number) {
  if (t >= INLET_LIMIT_C) return 'var(--destructive)'
  if (t >= INLET_WARN_C) return 'var(--warning)'
  return 'var(--color-temp)'
}

export function InletChart() {
  const near = PREVIEW_INLET.filter(r => r.temp >= INLET_WARN_C).length
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Hall B inlet temperature
          {near > 0 && (
            <Badge variant="warning-light">
              <TriangleAlertIcon aria-hidden="true" />
              {near} {near === 1 ? 'rack' : 'racks'} near the limit
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Latest reading per rack. Limit {INLET_LIMIT_C} °C, dashed.</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="aspect-auto h-56 w-full">
          <BarChart accessibilityLayer data={PREVIEW_INLET} margin={{ top: 8, right: 8, left: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="rack" tickLine={false} axisLine={false} tickMargin={8} />
            <YAxis domain={[20, 34]} tickLine={false} axisLine={false} width={44} tickFormatter={v => `${v}°`} />
            <ReferenceLine y={INLET_LIMIT_C} stroke="var(--destructive)" strokeDasharray="4 4" />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  indicator="dot"
                  formatter={value => (
                    <span className="font-semibold text-foreground tabular-nums">{Number(value).toFixed(1)} °C</span>
                  )}
                />
              }
            />
            <Bar dataKey="temp" radius={4}>
              {PREVIEW_INLET.map(r => (
                <Cell key={r.rack} fill={barColor(r.temp)} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
