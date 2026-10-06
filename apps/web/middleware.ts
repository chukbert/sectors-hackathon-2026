import { NextRequest, NextResponse } from "next/server";

// Demo publik hanya menampilkan Struk Jadi Saham; halaman IDXMACA lama dialihkan ke beranda.
export function middleware(req: NextRequest) {
  if (process.env.PUBLIC_DEMO === "1") {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ["/idxmaca", "/idxmaca/:path*"] };
