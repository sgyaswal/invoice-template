#!/usr/bin/env python3
"""Push the staged site to a Hugging Face static Space.

The Space needs a README with YAML frontmatter to pick its SDK, and that
frontmatter would be noise at the top of the GitHub README — so the Space
README is generated here instead of living in the repo.

Uploads with delete_patterns="*", so a file removed from the repo also
disappears from the Space rather than lingering forever.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
from pathlib import Path

from huggingface_hub import HfApi

SPACE_README = """---
title: {title}
emoji: "\N{RECEIPT}"
colorFrom: indigo
colorTo: blue
sdk: static
app_file: index.html
pinned: false
---

# {title}

Invoice / quotation generator — plain HTML, CSS and vanilla JavaScript.

Deployed automatically from [{repo}](https://github.com/{repo}).
Edits made here are overwritten by the next push to `main`.
"""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--space", required=True, help="Space id, e.g. user/invoice-template")
    parser.add_argument("--site", default="_site", help="staged directory to upload")
    parser.add_argument("--repo", default=os.environ.get("GITHUB_REPOSITORY", ""), help="source GitHub repo")
    parser.add_argument("--title", default="", help="Space title (defaults to the Space name)")
    args = parser.parse_args()

    site = Path(args.site).resolve()
    if not (site / "index.html").is_file():
        print(f"::error::{site}/index.html not found — run scripts/stage_site.sh first", file=sys.stderr)
        return 1

    token = os.environ.get("HF_TOKEN")
    if not token:
        print("::error::HF_TOKEN is not set", file=sys.stderr)
        return 1

    title = args.title or args.space.split("/")[-1].replace("-", " ").title()
    api = HfApi(token=token)
    api.create_repo(repo_id=args.space, repo_type="space", space_sdk="static", exist_ok=True)

    sha = os.environ.get("GITHUB_SHA", "local")[:7]

    with tempfile.TemporaryDirectory() as tmp:
        staging = Path(tmp) / "space"
        shutil.copytree(site, staging)
        (staging / "README.md").write_text(
            SPACE_README.format(title=title, repo=args.repo or args.space), encoding="utf-8"
        )

        api.upload_folder(
            repo_id=args.space,
            repo_type="space",
            folder_path=str(staging),
            commit_message=f"Deploy {sha}",
            delete_patterns="*",
        )

    print(f"deployed to https://huggingface.co/spaces/{args.space}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
