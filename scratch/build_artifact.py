"""Build scratch/artifact.html (the claude.ai Artifact version) from scratch.html.

The Artifact host wraps the page in its own <html>/<head>/<body>, so this keeps the
head's <title>, scripts and <style>, the body's content, and swaps the local overlay
for the inline review dock in artifact-overlay.js.
"""
import os, re

here = os.path.dirname(os.path.abspath(__file__))
src = open(os.path.join(here, "scratch.html"), encoding="utf-8").read()
dock = open(os.path.join(here, "artifact-overlay.js"), encoding="utf-8").read()

head = re.search(r"<head>(.*?)</head>", src, re.S).group(1)
body = re.search(r"<body[^>]*>(.*?)</body>", src, re.S).group(1)

head = re.sub(r'<meta charset="utf-8">\s*', "", head)
head = re.sub(r'<meta name="viewport"[^>]*>\s*', "", head)
title = re.search(r"<title>.*?</title>", head, re.S).group(0)
head = head.replace(title, "")

early_state = ("<script>(function(){var s;try{s=sessionStorage.getItem('rv-state')}catch(e){}"
               "document.body.dataset.state=s||'full'})();</script>")
assert '<script src="overlay.js"></script>' in body
body = body.replace('<script src="overlay.js"></script>', "<script>\n" + dock + "</script>")

out = title + "\n" + early_state + "\n" + head.strip() + "\n" + body.strip() + "\n"
open(os.path.join(here, "artifact.html"), "w", encoding="utf-8").write(out)
print("wrote scratch/artifact.html", len(out), "bytes")
