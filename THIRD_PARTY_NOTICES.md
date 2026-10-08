# Third-party notices

The star frame sequence, default verb list, header layout and animated π mascot are adapted from
[cc-my-pi](https://github.com/timvdhoorn/cc-my-pi), version 1.4.1, under the MIT license.

Copyright (c) 2025-2026 FammasMaz (original pi-cc-tools)
Copyright (c) 2026 Tim van den Hoorn (cc-my-pi modifications)

The full license is included in LICENSE. The default verb list preserves upstream
entries, including duplicates, to preserve its sampling distribution.

The header layout scaffolding and render helpers also descend from
[pi-claude-code-tui](https://github.com/Phoobobo/pi-claude-code-tui) by Phoobobo (MIT).
The header helpers and mascot are in `extensions/header/`; the integration and
live resource counting are adapted for this package. The full MIT license is in LICENSE.

The integration uses Pi's native working indicator API and small display/header
wrappers; it does not bundle the full cc-my-pi or pi-cc-extensions packages.
