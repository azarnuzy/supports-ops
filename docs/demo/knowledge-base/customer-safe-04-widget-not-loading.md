# Troubleshooting: Web Widget not appearing on my site

**Visibility: Customer-Safe**

If the chat launcher does not appear after adding the embed snippet, check these in order:

1. **Domain allowlist.** The Widget only loads on domains added under **Settings → Web Widget**. Add the exact host, without protocol, such as `help.example.com` — not `https://help.example.com/`.
2. **Snippet placement.** The script tag must be present in the rendered HTML, ideally right before `</body>`. Some site builders strip custom scripts from certain page templates; check the page source in your browser, not just the editor.
3. **Ad blockers and privacy extensions.** A small number of aggressive blockers treat chat widgets as trackers. Testing in a private/incognito window with extensions disabled rules this out quickly.
4. **Content Security Policy (CSP).** If your site sets a strict CSP header, it must allow script and frame sources from our Widget domain. This is the most common cause on enterprise sites with locked-down CSPs.

If none of these resolve it, a Human Agent can pull your Workspace's Widget configuration and check server-side logs for rejected load requests from your domain.
