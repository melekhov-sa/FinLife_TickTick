import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_ROUTES = new Set(["/login", "/register", "/reset-password", "/logout"]);
const PUBLIC_PREFIXES = ["/share/"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_ROUTES.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  let user: { id: string } | null = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (err) {
    console.error("[proxy] getUser failed:", err);
    // Fail-safe: treat as unauthenticated
    user = null;
  }

  console.log(`[proxy] ${pathname} user=${user?.id ?? "null"} public=${isPublic}`);

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("from", pathname);
    const redirect = NextResponse.redirect(url);
    // Forward any cookies the supabase client set during getUser (e.g. refresh)
    response.cookies.getAll().forEach((c) => {
      redirect.cookies.set(c.name, c.value);
    });
    return redirect;
  }

  if (user && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

// Статика не должна проходить проверку авторизации: иначе запрос за шрифтом
// или манифестом получает 307 на /login и отдаёт HTML вместо файла, а каждый
// такой запрос ещё и зря дёргает getUser() в Supabase.
// Кроме _next/* и картинок исключаем: шрифты (public/fonts), манифест PWA и
// service worker — всё это лежит в public и обязано отдаваться без сессии.
//
// Отдельно исключён `api/v2/widget/` — данные для виджетов на домашнем экране.
// Они приходят из Scriptable без куки и авторизуются собственным токеном в
// адресе; без этого исключения запрос улетал бы на /login и до бэкенда не
// доходил. Обрати внимание на слэш: `api/v2/widget-token` под исключение НЕ
// попадает и остаётся под обычной Supabase-авторизацией.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|manifest.json|service-worker.js|api/v2/widget/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2|woff|ttf|otf)$).*)",
  ],
};
