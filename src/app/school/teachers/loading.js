import { PageLoader } from '@/components/spinner'

// Next renders this while the segment's server components fetch. Without it
// navigation just hangs on the previous screen with no feedback.
export default function Loading() {
  return <PageLoader label="Loading teachers…" />
}
