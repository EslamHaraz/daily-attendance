<template>
  <div class="home">
    <div class="container">
      <h1 class="text-white fw-bold">مرحبا بك {{ username }}</h1>

      <div class="text-end">
        <button class="btn btn-primary mb-3 me-3 text-white" @click="logout">
          تسجيل خروج
        </button>
        <button type="button" class="btn btn-success mb-3" @click="addStart">
          تسجيل حضور اليوم
        </button>
      </div>

      <p
        v-if="workDays.length === 0"
        class="text-center text-white fw-bold my-4"
      >
        👋 لم يتم تسجيل حضور هذا الشهر بعد
      </p>

      <table class="table table-striped" v-if="workDays.length > 0">
        <thead>
          <tr>
            <th scope="col">اليوم</th>
            <th scope="col">التاريخ</th>
            <th scope="col">الحضور</th>
            <th scope="col">الانصراف</th>
            <th scope="col">عدد الساعات</th>
            <th scope="col">الاجراء</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in workDays" :key="item.id">
            <th scope="row">{{ item.Day }}</th>
            <td>{{ item.Date }}</td>
            <td>{{ formatDisplayTime(item.theAudience) }}</td>
            <td>
              {{ item.Dismissing ? formatDisplayTime(item.Dismissing) : "—" }}
            </td>

            <!-- حساب عدد الساعات Live (بصيغة H:MM) -->
            <td>
              {{
                formatMinutesAsHMM(
                  calcMinutes(item.theAudience, item.Dismissing)
                )
              }}
            </td>

            <td>
              <button
                type="button"
                class="btn btn-dark ms-2"
                v-if="!item.Dismissing"
                @click="addEnd(item)"
              >
                انصراف
              </button>

              <span v-if="item.Dismissing" class="text-success ms-2">✔️</span>

              <button
                type="button"
                class="btn btn-danger"
                @click="deleteItem(item)"
              >
                حذف
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="d-flex justify-content-between align-items-center">
        <div class="hours-total text-white" v-if="workDays.length > 0">
          <p class="fw-bold mb-0 ms-2">{{ totalWorkHoursText }}</p>
        </div>

        <button
          v-if="workDays.length > 0"
          type="button"
          class="btn btn-danger mt-3"
          @click="deleteAll"
        >
          حذف كل السجلات
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { db } from "@/firebase/firebase";

import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";

export default {
  name: "HomeView",
  data() {
    return {
      workDays: [],
      username: localStorage.getItem("username") || "",
    };
  },

  mounted() {
    const isLoggedIn = localStorage.getItem("loggedIn");
    if (!isLoggedIn) this.$router.push("/login");
    this.loadWorkDays();
  },

  methods: {
    // ----- تنسيق الوقت للعرض: يقبل "9", "9.5", "9.30", "9:30"
    formatDisplayTime(timeStr) {
      if (!timeStr) return "";
      const parts = String(timeStr).replace(":", ".").split(".");
      let hh = Number(parts[0]) || 0;
      const mm = parts[1] ? String(parts[1]).padStart(2, "0") : "00";
      const isPM = hh >= 12;
      const displayHour = hh % 12 === 0 ? 12 : hh % 12;
      return `${displayHour}.${mm} ${isPM ? "م" : "ص"}`;
    },

    // ----- parse تاريخ بصيغة "DD/MM/YYYY" أو "DD-MM-YYYY" إلى Date object
    parseDateString(dateStr) {
      if (!dateStr) return null;
      // يقبل "DD/MM/YYYY" أو "DD-MM-YYYY"
      const cleaned = dateStr.replace(/\//g, "-");
      const parts = cleaned.split("-");
      if (parts.length !== 3) return null;
      const day = Number(parts[0]),
        month = Number(parts[1]) - 1,
        year = Number(parts[2]);
      return new Date(year, month, day);
    },

    // ----- جلب الداتا وترتيبها (قديم -> جديد)
    async loadWorkDays() {
      const userId = localStorage.getItem("userId");

      const q = query(
        collection(db, "workDays"),
        where("userId", "==", Number(userId))
      );

      const snap = await getDocs(q);

      this.workDays = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

      // ✅ ترتيب حسب التاريخ من الأقدم للأحدث
      this.workDays.sort((a, b) => {
        const [dayA, monthA, yearA] = a.Date.split("/").map(Number);
        const [dayB, monthB, yearB] = b.Date.split("/").map(Number);

        const dateA = new Date(yearA, monthA - 1, dayA);
        const dateB = new Date(yearB, monthB - 1, dayB);

        return dateA - dateB;
      });
    },

    // ----- اضافة حضور (يتأكد أنه مش مسجل نفس اليوم)
    async addStart() {
      const userId = localStorage.getItem("userId");
      if (!userId) {
        return this.$router.push("/login");
      }

      const now = new Date();
      const day = now.toLocaleDateString("ar-EG", { weekday: "long" });
      const dateParts = now.toLocaleDateString("en-GB").split("/");
      const date = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`;
      const time = `${now.getHours()}.${now.getMinutes()}`;

      const q = query(
        collection(db, "workDays"),
        where("Date", "==", date),
        where("userId", "==", userId)
      );
      const exists = await getDocs(q);
      if (!exists.empty) {
        alert("تم تسجيل حضور اليوم بالفعل ✅");
        return;
      }

      await addDoc(collection(db, "workDays"), {
        Date: date,
        Day: day,
        theAudience: time,
        Dismissing: null,
        userId: userId, // ← مهم جداً
      });

      this.loadWorkDays();
    },
    // ----- تسجيل انصراف وتحديث doc
    async addEnd(item) {
      if (item.Dismissing) return;
      const now = new Date();
      const dismissStr = `${now.getHours()}.${String(now.getMinutes()).padStart(
        2,
        "0"
      )}`;
      await updateDoc(doc(db, "workDays", item.id), { Dismissing: dismissStr });
      item.Dismissing = dismissStr;
    },

    // ----- حذف سجل واحد
    async deleteItem(item) {
      await deleteDoc(doc(db, "workDays", item.id));
      this.workDays = this.workDays.filter((d) => d.id !== item.id);
    },

    // ----- حذف الكل
    async deleteAll() {
      if (!confirm("متأكد؟ سيتم حذف كل السجلات نهائياً")) return;
      const q = await getDocs(collection(db, "workDays"));
      const batch = [];
      q.forEach((docItem) =>
        batch.push(deleteDoc(doc(db, "workDays", docItem.id)))
      );
      await Promise.all(batch);
      this.workDays = [];
    },

    logout() {
      localStorage.removeItem("loggedIn");
      localStorage.removeItem("userId");
      localStorage.removeItem("userName");
      this.$router.push("/login");
    },
    // ----- تحويل أي تمثيل وقت مقبول إلى دقائق منذ منتصف الليل
    timeStringToMinutes(str) {
      if (!str) return null;
      const s = String(str).replace(":", ".").trim();
      const parts = s.split(".");
      const hh = Number(parts[0]) || 0;
      const mm = parts[1] !== undefined ? Number(parts[1]) : 0;
      // حماية لو المستخدم كتب "9.5" ونقصد 9:05 -> لكن في مشروعنا نفترض "9.5" = 9 دقيقة 5 (نفس منطق سابق)
      // لو بتحب سلوك مختلف قولي نعالج.
      return hh * 60 + mm;
    },

    // ----- نحسب الفرق بالدقائق بين البداية والنهاية
    calcMinutes(audience, dismissing) {
      const start = this.timeStringToMinutes(audience);
      const end = this.timeStringToMinutes(dismissing);
      if (start == null || end == null) return null;

      let diff = end - start;
      if (diff === 0) {
        // لو نفس الوقت (مثال 6 -> 6) => اعتبره شيفت 12 ساعة حسب اتفاقك
        diff = 12 * 60;
      } else if (diff < 0) {
        // مرّ على نص الليل -> نضيف 24 ساعة
        diff += 24 * 60;
      }
      return diff;
    },

    // ----- تحويل دقائق إلى "H:MM" للنص المعروض في الخانة
    formatMinutesAsHMM(minutes) {
      if (minutes == null) return "—";
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${h}:${String(m).padStart(2, "0")}`;
    },
  },

  computed: {
    // ----- نجمع إجمالي الدقائق ثم نعرضه كنص "X ساعة Y دقيقة"
    totalWorkHoursText() {
      let totalMinutes = 0;
      this.workDays.forEach((d) => {
        const mins = this.calcMinutes(d.theAudience, d.Dismissing);
        if (mins != null) totalMinutes += mins;
      });
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `   ${h}  اجمالي ساعات `;
    },
  },
};
</script>

<style scoped>
.home {
  padding: 20px 0;
}
.container {
  background: #222;
  padding: 20px;
  border-radius: 8px;
}
.text-white {
  color: #fff;
}
.table {
  background: #fff;
  margin-top: 10px;
}
.hours-total {
  margin-top: 12px;
  display: flex;
  align-items: center;
}
table {
  direction: rtl;
}
tbody,
td,
tfoot,
th,
thead,
tr {
  border-color: inherit;
  border-style: solid;
  border-width: 0;
  border: 1px solid #6f6f6f;
}
</style>
