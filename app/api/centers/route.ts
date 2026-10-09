import { db } from '@/lib/store'
import { ok } from '@/lib/http'

export async function GET() {
  return ok({
    centers: db.centers.filter((c) => c.active).map(({ id, name, city }) => ({ id, name, city })),
  })
}
