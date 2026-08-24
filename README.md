# colabroom.com

The marketing and account-deletion page for CoLabRoom, a songwriting app for
bands, published by Decibel Zero.

One static page, no build step. GitHub Pages serves `index.html` from `main`;
`CNAME` points it at the custom domain. Editing the file and pushing is the
whole deploy.

Deliberately a separate repository from the app: the app repo carries working
notes in `docs/` that have no business being served as a website.

The account-deletion section is not decoration — Google Play and the App Store
both require a publicly reachable deletion route, and this page is it. Keep it
reachable and keep the support address live.
