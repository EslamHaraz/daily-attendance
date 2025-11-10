<template>
  <div class="login d-flex justify-content-center align-items-center">
    <div class="login-box p-4 rounded shadow">
      <h2 class="text-white text-center mb-4">تسجيل الدخول</h2>

      <input
        v-model="email"
        type="email"
        class="form-control mb-3"
        placeholder="البريد الالكتروني"
      />

      <input
        v-model="password"
        type="password"
        class="form-control mb-3"
        placeholder="كلمة المرور"
      />

      <button class="btn btn-success w-100" @click="loginUser">دخول</button>

      <p v-if="errorMessage" class="text-danger text-center mt-3">
        {{ errorMessage }}
      </p>
    </div>
  </div>
</template>

<script>
import { db } from "@/firebase/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

export default {
  data() {
    return {
      email: "",
      password: "",
      errorMessage: "",
    };
  },
  methods: {
    async loginUser() {
      this.errorMessage = "";

      if (!this.email || !this.password) {
        this.errorMessage = "من فضلك ادخل البيانات كاملة";
        return;
      }

      try {
        const q = query(
          collection(db, "users"),
          where("email", "==", this.email),
          where("password", "==", this.password)
        );

        const snap = await getDocs(q);

        if (snap.empty) {
          this.errorMessage = "البيانات غير صحيحة ❌";
          return;
        }

        const userData = snap.docs[0].data();

        // ✅ نحفظ userId من الفيلد اللي جوا الدوكيمنت
        localStorage.setItem("loggedIn", "true");
        localStorage.setItem("userId", userData.userId); // هنا الصح
        localStorage.setItem("username", userData.username);

        this.$router.push("/");
      } catch (err) {
        console.log(err);
        this.errorMessage = "حصل خطأ، حاول تاني";
      }
    },
  },
};
</script>

<style scoped>
.login {
  height: 100vh;
  background: #111;
}
.login-box {
  width: 350px;
  background: #222;
  direction: rtl;
}
</style>
