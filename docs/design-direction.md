# Relay interface direction

The revised brief explicitly replaces the earlier illustrated dashboard with a restrained interface inspired by [DeepSeek Harness](https://www.deepseek.com/harness/en/). The reference was inspected in a desktop browser before implementation.

Design read: a working CS2 console for server owners, using a quiet blue atmosphere, neutral typography and an elegant translucent terminal. Design variance 5, motion intensity 2, visual density 3. This is a visual overhaul of the application, not a new marketing site.

## Audit and decisions

The previous design used a heavy fixed sidebar, orange accents, Barlow typography, a large decorative map diorama, multiple metric cards and a separate console destination. Those choices competed with the user's primary task. They are retired.

The revision keeps the Relay identity, actual server management capabilities, inline/JSON connection flow, local helper launchers, and keyboard-accessible controls. The terminal becomes the main connected page, with compact true server state and secondary management tools. Command completion, history, copying and the command catalogue continue to work.

Reference characteristics applied: an understated horizontal header, generous controlled spacing, a broad desaturated blue background fading into a dark base, light neutral text, quiet white controls, and a single translucent terminal surface. The app does not copy DeepSeek branding or content, and does not add particle effects, decorative media or a fake terminal preview.

Typography is self-hosted DM Sans with Fragment Mono for actual console content. Background and translucency use CSS, with reduced-motion and reduced-transparency alternatives. The RCON prompt must remain visible and usable on a 1366×768 laptop; mobile layout is explicit.

The named taste skill is applied contextually. The user's requested functional terminal and removal of unnecessary images take priority over generic marketing-page image requirements. No new imagery is needed for this application.
