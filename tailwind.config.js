/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        /** App shell — petróleo / navy */
        hdr: "#0f2744",
        hdr2: "#153a5c",
        /** Canvas y superficies */
        bg: "#ebeff5",
        "app-canvas": "#ebeff5",
        "app-sidebar": "#0f1729",
        surface: "#ffffff",
        surface2: "#f0f3f8",
        t900: "#0f172a",
        t800: "#1e293b",
        t700: "#334155",
        t600: "#475569",
        t500: "#64748b",
        t400: "#94a3b8",
        t300: "#94a3b8",
        tinv: "#e2e8f0",
        bdr: "#d8dee9",
        bdr2: "#c5cedd",
        /** Primario acción — cobre / naranjo controlado */
        copper: "#c45d2c",
        "copper-muted": "#e8a077",
        "copper-bg": "#fdf4ee",
        /** Secundario — azul petróleo (links, focos secundarios) */
        blue: "#1e4a6e",
        blue2: "#2d5f8a",
        bluebg: "#e4edf5",
        violet: "#153a5c",
        green: "#047857",
        amber: "#B45309",
        red: "#B91C1C",
        slate: "#475569",
      },
      fontFamily: {
        playfair: ['"Playfair Display"', 'serif'],
        sans: ['"IBM Plex Sans"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
      borderRadius: {
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xs: "calc(var(--radius) - 6px)",
        r12: "12px",
        r8: "8px",
        r4: "4px",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        sh1: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)",
        sh2: "0 4px 12px rgba(0,0,0,.07), 0 1px 3px rgba(0,0,0,.03)",
        sh3: "0 10px 28px rgba(0,0,0,.08), 0 2px 6px rgba(0,0,0,.04)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "caret-blink": {
          "0%,70%,100%": { opacity: "1" },
          "20%,50%": { opacity: "0" },
        },
        "blink": {
          "0%,100%": { opacity: "1" },
          "50%": { opacity: "0.3" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "caret-blink": "caret-blink 1.25s ease-out infinite",
        "blink": "blink 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
