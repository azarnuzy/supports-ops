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
        brand: "Platform",
        dashboard: "Dashboard",
        login: "Login",
        profile: "Edit profile",
      },
      sidebar: {
        workspace: "Workspace",
      },
      auth: {
        login: {
          title: "Platform login",
          email: "Email",
          password: "Password",
          submit: "Login",
          pending: "Logging in...",
          createAccount: "Create a user account",
          fallbackError: "Authentication failed.",
        },
        register: {
          title: "Create user account",
          name: "Name",
          email: "Email",
          password: "Password",
          submit: "Register",
          pending: "Creating...",
          loginLink: "Already have an account?",
          fallbackError: "Registration failed.",
        },
      },
      dashboard: {
        accountActive: "Active account",
        accountCard: {
          description: "Basic account metadata for this workspace.",
          title: "Account details",
        },
        title: "Platform dashboard",
        description: "Review your account status and keep your profile ready for user-facing work.",
        editProfile: "Edit profile",
        emailUnverified: "Email unverified",
        emailVerified: "Email verified",
        eyebrow: "Account overview",
        joined: "Joined",
        lastUpdated: "Last updated",
        profileCard: {
          description: "This is the profile other product surfaces can use.",
          title: "Profile",
        },
        session: "Session",
        email: "Email",
        logout: "Logout",
        logoutPending: "Logging out...",
        logoutFallbackError: "Failed to log out.",
        userId: "User ID",
      },
      profile: {
        description: "Update the display details tied to your user account.",
        eyebrow: "Profile settings",
        form: {
          cancel: "Cancel",
          description: "Name is required. Avatar image is optional and must be a public URL.",
          fallbackError: "Failed to save profile.",
          image: "Avatar URL",
          imageDescription: "Leave empty to remove the avatar image.",
          imageInvalid: "Enter a valid http or https image URL.",
          name: "Display name",
          nameDescription: "Use the name people should recognize in the product.",
          nameRequired: "Display name is required.",
          nameTooLong: "Display name must be 100 characters or fewer.",
          save: "Save profile",
          saved: "Profile saved.",
          saving: "Saving...",
          title: "Edit profile",
        },
        preview: {
          description: "A quick check before saving your changes.",
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
        brand: "Platform",
        dashboard: "Dasbor",
        login: "Masuk",
        profile: "Edit profil",
      },
      sidebar: {
        workspace: "Workspace",
      },
      auth: {
        login: {
          title: "Masuk Platform",
          email: "Email",
          password: "Kata sandi",
          submit: "Masuk",
          pending: "Sedang masuk...",
          createAccount: "Buat akun pengguna",
          fallbackError: "Autentikasi gagal.",
        },
        register: {
          title: "Buat akun pengguna",
          name: "Nama",
          email: "Email",
          password: "Kata sandi",
          submit: "Daftar",
          pending: "Membuat...",
          loginLink: "Sudah punya akun?",
          fallbackError: "Pendaftaran gagal.",
        },
      },
      dashboard: {
        accountActive: "Akun aktif",
        accountCard: {
          description: "Metadata dasar akun untuk workspace ini.",
          title: "Detail akun",
        },
        title: "Dasbor platform",
        description: "Tinjau status akun dan jaga profil tetap siap untuk penggunaan produk.",
        editProfile: "Edit profil",
        emailUnverified: "Email belum diverifikasi",
        emailVerified: "Email terverifikasi",
        eyebrow: "Ringkasan akun",
        joined: "Bergabung",
        lastUpdated: "Terakhir diperbarui",
        profileCard: {
          description: "Profil ini dapat digunakan oleh permukaan produk lain.",
          title: "Profil",
        },
        session: "Sesi",
        email: "Email",
        logout: "Keluar",
        logoutPending: "Sedang keluar...",
        logoutFallbackError: "Gagal keluar.",
        userId: "ID pengguna",
      },
      profile: {
        description: "Perbarui detail tampilan yang terhubung ke akun pengguna.",
        eyebrow: "Pengaturan profil",
        form: {
          cancel: "Batal",
          description: "Nama wajib diisi. Gambar avatar opsional dan harus berupa URL publik.",
          fallbackError: "Gagal menyimpan profil.",
          image: "URL avatar",
          imageDescription: "Kosongkan untuk menghapus gambar avatar.",
          imageInvalid: "Masukkan URL gambar http atau https yang valid.",
          name: "Nama tampilan",
          nameDescription: "Gunakan nama yang mudah dikenali di produk.",
          nameRequired: "Nama tampilan wajib diisi.",
          nameTooLong: "Nama tampilan maksimal 100 karakter.",
          save: "Simpan profil",
          saved: "Profil tersimpan.",
          saving: "Menyimpan...",
          title: "Edit profil",
        },
        preview: {
          description: "Periksa cepat sebelum menyimpan perubahan.",
          title: "Pratinjau",
        },
        title: "Edit profil",
      },
    },
  },
} satisfies Resource;

export const i18n = createFrontendI18n({
  appName: "platform",
  defaultNamespace: "common",
  resources,
});
