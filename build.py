"""Construit le site pour GitHub Pages : copie les fichiers, crée une page fixe
par article (/a/<slug>/), le plan du site (sitemap.xml), robots.txt et 404.html.
Lancé automatiquement par .github/workflows/pages.yml."""
import html, json, os, re, shutil, urllib.request
from datetime import datetime, timezone
from html.parser import HTMLParser

SITE = "https://blog.marckland.com"
NAME = "Marck-Land Ahouansou"
API = "https://inglzcjrvhauqoezfbdd.supabase.co/rest/v1/articles"
KEY = "sb_publishable_MXJi2QLnqEBi7rJUQ8sf0g_xBM043Fh"  # clé publique (lecture seule)
OUT = "_site"
SKIP = {".git", ".github", "build.py", "README.md", OUT}

def fetch():
    q = "?select=title,slug,lede,content,cover_url,tags,published_at,updated_at,category:categories(name,slug)&order=published_at.desc"
    req = urllib.request.Request(API + q, headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
    with urllib.request.urlopen(req, timeout=30) as r:
        rows = json.load(r)
    now = datetime.now(timezone.utc).isoformat()
    return [a for a in rows if a.get("published_at") and a["published_at"] <= now]

ALLOWED = {"p","br","strong","b","em","i","u","s","sub","sup","a","h2","h3","h4","blockquote","ul","ol","li","img","hr","table","tbody","tr","td","th","figure","figcaption","span","iframe"}
ATTRS = {"href","src","alt","class","width","title"}
class Clean(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.out = []; self.skip = 0
    def handle_starttag(self, tag, attrs):
        if tag in ("script","style"): self.skip += 1; return
        if tag not in ALLOWED: return
        if tag == "iframe":
            src = dict(attrs).get("src") or ""
            if not re.match(r"^https://(www\.youtube(-nocookie)?\.com/embed/|player\.vimeo\.com/video/)", src): return
        keep = []
        for k, v in attrs:
            if k not in ATTRS or v is None: continue
            if k in ("href","src") and not re.match(r"^(https?:|/|#|mailto:)", v.strip(), re.I): continue
            keep.append(f' {k}="{html.escape(v, quote=True)}"')
        self.out.append(f"<{tag}{''.join(keep)}>")
    def handle_endtag(self, tag):
        if tag in ("script","style"): self.skip = max(0, self.skip-1); return
        if tag in ALLOWED and tag not in ("br","img","hr"): self.out.append(f"</{tag}>")
    def handle_data(self, data):
        if not self.skip: self.out.append(html.escape(data, quote=False))
def clean(s):
    c = Clean(); c.feed(s or ""); c.close(); return "".join(c.out)

def text(s, n=None):
    t = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()
    return t if not n or len(t) <= n else t[:n-1].rsplit(" ", 1)[0] + "…"

def esc(s): return html.escape(s or "", quote=True)

def page(tpl, a):
    url = f"{SITE}/a/{a['slug']}/"
    desc = text(a.get("lede")) or text(a.get("content"), 160)
    img = a.get("cover_url") or f"{SITE}/assets/photo.jpg"
    title = f"{a['title']} — {NAME}"
    ld = {"@context":"https://schema.org","@type":"BlogPosting","headline":a["title"],"description":desc,
          "image":img,"url":url,"mainEntityOfPage":url,"datePublished":a["published_at"],
          "dateModified":a.get("updated_at") or a["published_at"],"inLanguage":"fr",
          "author":{"@type":"Person","name":NAME,"url":"https://marckland.com"}}
    if a.get("tags"): ld["keywords"] = ", ".join(a["tags"])
    ldj = json.dumps(ld, ensure_ascii=False).replace("</", "<\\/")
    head = (f'<base href="/">\n<title>{esc(title)}</title>\n'
            f'<meta name="description" content="{esc(desc)}">\n<link rel="canonical" href="{url}">\n'
            f'<meta property="og:type" content="article">\n<meta property="og:site_name" content="{NAME}">\n'
            f'<meta property="og:locale" content="fr_CA">\n<meta property="og:url" content="{url}">\n'
            f'<meta property="og:title" content="{esc(a["title"])}">\n<meta property="og:description" content="{esc(desc)}">\n'
            f'<meta property="og:image" content="{esc(img)}">\n<meta property="article:published_time" content="{a["published_at"]}">\n'
            f'<meta name="twitter:card" content="summary_large_image">\n'
            f'<script type="application/ld+json">{ldj}</script>')
    out = re.sub(r"<title>.*?</title>\s*<meta name=\"description\"[^>]*>", lambda m: head, tpl, count=1, flags=re.S)
    body = (f'<h1>{esc(a["title"])}</h1>' + (f'<p class="lede">{esc(a.get("lede"))}</p>' if a.get("lede") else "")
            + f'<div class="prose">{clean(a.get("content"))}</div>')
    out = re.sub(r'(<article class="narrow article" id="article">).*?(</article>)', lambda m: m.group(1) + body + m.group(2), out, count=1, flags=re.S)
    return out

def main():
    if os.path.exists(OUT): shutil.rmtree(OUT)
    shutil.copytree(".", OUT, ignore=lambda d, names: [n for n in names if d == "." and n in SKIP])
    tpl = open("article.html", encoding="utf-8").read()
    arts = fetch()
    for a in arts:
        d = os.path.join(OUT, "a", a["slug"]); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, "index.html"), "w", encoding="utf-8").write(page(tpl, a))
    today = datetime.now(timezone.utc).date().isoformat()
    urls = [(f"{SITE}/", today), (f"{SITE}/articles.html", today), (f"{SITE}/a-propos.html", None)]
    urls += [(f"{SITE}/a/{a['slug']}/", (a.get("updated_at") or a["published_at"])[:10]) for a in arts]
    sm = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    sm += [f"  <url><loc>{esc(u)}</loc>" + (f"<lastmod>{d}</lastmod>" if d else "") + "</url>" for u, d in urls]
    sm.append("</urlset>")
    open(os.path.join(OUT, "sitemap.xml"), "w", encoding="utf-8").write("\n".join(sm) + "\n")
    open(os.path.join(OUT, "robots.txt"), "w").write(f"User-agent: *\nDisallow: /admin.html\n\nSitemap: {SITE}/sitemap.xml\n")
    open(os.path.join(OUT, "404.html"), "w", encoding="utf-8").write(
        '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex">'
        '<title>Page introuvable</title><script>var m=location.pathname.match(/^\\/a\\/([^/]+)/);'
        'if(m)location.replace("/article.html?a="+m[1]);</script></head><body style="font-family:Georgia,serif;'
        'max-width:600px;margin:15vh auto;padding:0 24px"><h1>Page introuvable</h1>'
        '<p><a href="/">Retour à l\'accueil</a></p></body></html>')
    print(f"{len(arts)} article(s) générés")

if __name__ == "__main__":
    main()
