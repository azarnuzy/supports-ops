import { createFrontendI18n, type Resource } from "@repo/ui/i18n";

const resources = {
  en: {
    common: {
      language: {
        label: "Language",
        options: {
          en: "English",
          id: "Bahasa Indonesia",
        },
      },
      theme: {
        label: "Theme",
        options: {
          dark: "Dark",
          light: "Light",
          system: "System",
        },
      },
      nav: {
        brand: "Admin",
        overview: "Overview",
        login: "Login",
        profile: "Edit profile",
      },
      sidebar: {
        operations: "Operations",
      },
      auth: {
        login: {
          title: "Admin login",
          email: "Email",
          password: "Password",
          submit: "Login",
          pending: "Logging in...",
          fallbackError: "Authentication failed.",
        },
      },
      dashboard: {
        eyebrow: "Admin operations",
        title: "Admin dashboard",
        description: "Review the current admin session and recent user activity.",
        session: "Session",
        email: "Email",
        logout: "Logout",
        logoutPending: "Logging out...",
        logoutFallbackError: "Failed to log out.",
        identity: {
          description: "Signed in with elevated access.",
          title: "Admin identity",
        },
        stats: {
          admins: "Admins in view",
          nextPage: "More pages",
          visibleUsers: "Visible users",
        },
        users: {
          description: "Latest users from the admin-only users endpoint.",
          empty: "No users found.",
          error: "Failed to load recent users.",
          joined: "Joined",
          loading: "Loading recent users...",
          name: "User",
          role: "Role",
          title: "Recent users",
        },
        forbidden: {
          title: "Forbidden",
          description: "Your account cannot access Admin.",
        },
      },
      profile: {
        description: "Update the profile details attached to your admin account.",
        eyebrow: "Admin profile",
        form: {
          cancel: "Cancel",
          description: "Name is required. Avatar image is optional and must be a public URL.",
          fallbackError: "Failed to save profile.",
          image: "Avatar URL",
          imageDescription: "Leave empty to remove the avatar image.",
          imageInvalid: "Enter a valid http or https image URL.",
          name: "Display name",
          nameDescription: "Use the name administrators should recognize.",
          nameRequired: "Display name is required.",
          nameTooLong: "Display name must be 100 characters or fewer.",
          save: "Save profile",
          saved: "Profile saved.",
          saving: "Saving...",
          title: "Edit profile",
        },
        preview: {
          description: "How your admin identity will appear in this app.",
          title: "Preview",
        },
        title: "Edit profile",
      },
    },
  },
  id: {
    common: {
      language: {
        label: "Bahasa",
        options: {
          en: "English",
          id: "Bahasa Indonesia",
        },
      },
      theme: {
        label: "Tema",
        options: {
          dark: "Gelap",
          light: "Terang",
          system: "Sistem",
        },
      },
      nav: {
        brand: "Admin",
        overview: "Ikhtisar",
        login: "Masuk",
        profile: "Edit profil",
      },
      sidebar: {
        operations: "Operasi",
      },
      auth: {
        login: {
          title: "Masuk Admin",
          email: "Email",
          password: "Kata sandi",
          submit: "Masuk",
          pending: "Sedang masuk...",
          fallbackError: "Autentikasi gagal.",
        },
      },
      dashboard: {
        eyebrow: "Operasi admin",
        title: "Dasbor admin",
        description: "Tinjau sesi admin saat ini dan aktivitas pengguna terbaru.",
        session: "Sesi",
        email: "Email",
        logout: "Keluar",
        logoutPending: "Sedang keluar...",
        logoutFallbackError: "Gagal keluar.",
        identity: {
          description: "Masuk dengan akses tinggi.",
          title: "Identitas admin",
        },
        stats: {
          admins: "Admin terlihat",
          nextPage: "Halaman lanjutan",
          visibleUsers: "Pengguna terlihat",
        },
        users: {
          description: "Pengguna terbaru dari endpoint khusus admin.",
          empty: "Tidak ada pengguna.",
          error: "Gagal memuat pengguna terbaru.",
          joined: "Bergabung",
          loading: "Memuat pengguna terbaru...",
          name: "Pengguna",
          role: "Peran",
          title: "Pengguna terbaru",
        },
        forbidden: {
          title: "Dilarang",
          description: "Akun Anda tidak dapat mengakses Admin.",
        },
      },
      profile: {
        description: "Perbarui detail profil yang terhubung ke akun admin.",
        eyebrow: "Profil admin",
        form: {
          cancel: "Batal",
          description: "Nama wajib diisi. Gambar avatar opsional dan harus berupa URL publik.",
          fallbackError: "Gagal menyimpan profil.",
          image: "URL avatar",
          imageDescription: "Kosongkan untuk menghapus gambar avatar.",
          imageInvalid: "Masukkan URL gambar http atau https yang valid.",
          name: "Nama tampilan",
          nameDescription: "Gunakan nama yang mudah dikenali administrator.",
          nameRequired: "Nama tampilan wajib diisi.",
          nameTooLong: "Nama tampilan maksimal 100 karakter.",
          save: "Simpan profil",
          saved: "Profil tersimpan.",
          saving: "Menyimpan...",
          title: "Edit profil",
        },
        preview: {
          description: "Tampilan identitas admin di aplikasi ini.",
          title: "Pratinjau",
        },
        title: "Edit profil",
      },
    },
  },
} satisfies Resource;

export const i18n = createFrontendI18n({
  appName: "admin",
  defaultNamespace: "common",
  resources,
});
