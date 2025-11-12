<template>
  <div class="home">
    <div class="container">
      <h1 class="text-white fw-bold">مرحبا بك {{ username }}</h1>

      <div class="text-end mb-3 d-flex justify-content-end gap-2">
        <button class="btn btn-primary" @click="logout">تسجيل خروج</button>
        <button class="btn btn-success" @click="addStart">تسجيل حضور اليوم</button>
      </div>

      <p v-if="workDays.length === 0" class="text-center text-white fw-bold my-4">
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
            <td>{{ item.Dismissing ? formatDisplayTime(item.Dismissing) : "—" }}</td>

            <!-- حساب عدد الساعات live (عرض H:MM) -->
            <td>{{ formatMinutesAsHMM(calcMinutes(item.theAudience, item.Dismissing)) }}</td>

            <td>
              <button
                v-if="!item.Dismissing"
                class="btn btn-dark ms-2"
                @click="addEnd(item)"
              >
                انصراف
              </button>

              <span v-if="item.Dismissing" class="text-success ms-2">✔️</span>

              <button class="btn btn-danger ms-2" @click="deleteItem(item)">حذف</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="d-flex justify-content-between align-items-center mt-3">
        <div class="hours-total text-white" v-if="workDays.length > 0">
          <p class="fw-bold mb-0">{{ totalWorkHoursText }}</p>
        </div>

        <button v-if="workDays.length > 0" class="btn btn-danger" @click="deleteAll">
          حذف كل السجلات
        </button>
      </div>
    </div>
  </div>
</template>

<script>
/*
  Home.vue كامل - ملاحظات:
  - يتطلب ملف src/firebase/firebase.js الذي يصدّر "db" (getFirestore(app))
  - يعتمد أن حقل التاريخ في الدوكيومنت مخزن كـ "DD-MM-YYYY" أو "DD/MM/YYYY" أو "DD/MM/YYYY" (البرنامج يتعامل مع الشرطتين أو السلاش)
  - يتوقع أن كل doc في workDays يحتوي على الحقول:
      Date (string), Day (string), theAudience (string), Dismissing (string|null), userId (number)
*/

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
    if (!isLoggedIn) {
      this.$router.push("/login");
      return;
    }
    this.loadWorkDays();
  },

  methods: {
    // تنسيق للعرض: يقبل "9", "9.5", "9.30", "9:30", "18.30", "18:30"
    formatDisplayTime(timeStr) {
      if (!timeStr && timeStr !== 0) return "";
      const s = String(timeStr).replace(",", ".").replace("：", ".").trim();
      // استبدال ":" بـ "."
      const safe = s.replace(":", ".");
      const parts = safe.split(".");
      let hh = Number(parts[0]) || 0;
      // دقائق: لو موجودة وغريبة نقأها أول خانتين فقط
      let mm = 0;
      if (parts[1] !== undefined) {
        // لو المدخل 199999.. نتعامل مع أول رقمين باعتبارها دقائق بعد التقريب الصحيح
        const minutesPart = String(parts[1]).slice(0, 2);
        mm = Number(minutesPart) || 0;
      }
      // إذا كان المستخدم نَزَّل قيمة عشرية مثل 9.5 وكان يقصد 9:30 أو 9:05؟ 
      // هنا نفترض "9.5" تعني 9 دقائق 5 (كما طلبت سابقاً) — لو عاوز سلوك آخر أغيره.
      // تحويل للعرض 12 ساعة مع ص/م
      const isPM = hh >= 12;
      const displayHour = hh % 12 === 0 ? 12 : hh % 12;
      return `${displayHour}:${String(mm).padStart(2, "0")} ${isPM ? "م" : "ص"}`;
    },

    // تحويل نص تاريخ (DD-MM-YYYY أو DD/MM/YYYY) إلى Date object
    parseDateStringToDate(dateStr) {
      if (!dateStr) return null;
      const cleaned = String(dateStr).replace(/\//g, "-").trim();
      const parts = cleaned.split("-");
      if (parts.length !== 3) return null;
      const day = Number(parts[0]);
      const month = Number(parts[1]) - 1;
      const year = Number(parts[2]);
      if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return null;
      return new Date(year, month, day);
    },

    // جلب البيانات حسب userId (Number) وترتيبها من الأقدم للأحدث
    async loadWorkDays() {
      try {
        const userIdStr = localStorage.getItem("userId");
        if (!userIdStr) {
          // لو مفيش userId نرجع للّوجين
          this.$router.push("/login");
          return;
        }
        // userId نخليه number
        const userId = Number(userIdStr);

        const q = query(collection(db, "workDays"), where("userId", "==", userId));
        const snap = await getDocs(q);
        this.workDays = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        // رتب حسب التاريخ من الأقدم للأحدث
        this.workDays.sort((a, b) => {
          const da = this.parseDateStringToDate(a.Date);
          const dbd = this.parseDateStringToDate(b.Date);
          if (!da || !dbd) return 0;
          return da - dbd;
        });
      } catch (err) {
        console.error("loadWorkDays error:", err);
      }
    },

    // إضافة حضور اليوم (يضيف userId كـ Number)
    async addStart() {
      try {
        const userIdStr = localStorage.getItem("userId");
        if (!userIdStr) {
          this.$router.push("/login");
          return;
        }
        const userId = Number(userIdStr);

        const now = new Date();
        const day = now.toLocaleDateString("ar-EG", { weekday: "long" });
        const dateParts = now.toLocaleDateString("en-GB").split("/"); // DD/MM/YYYY
        const date = `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`; // DD-MM-YYYY
        const time = `${now.getHours()}.${String(now.getMinutes()).padStart(2, "0")}`;

        // تأكد أنه مش موجود نفس اليوم لنفس المستخدم
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
          userId: userId, // الرقم
        });

        await this.loadWorkDays();
      } catch (err) {
        console.error("addStart error:", err);
        alert("حصل خطأ أثناء تسجيل الحضور");
      }
    },

    // تسجيل الانصراف (يحسب لاحقًا في العرض)
    async addEnd(item) {
      try {
        if (item.Dismissing) return;
        const now = new Date();
        const dismissStr = `${now.getHours()}.${String(now.getMinutes()).padStart(2, "0")}`;
        await updateDoc(doc(db, "workDays", item.id), { Dismissing: dismissStr });
        // حدث محليًا فورًا
        item.Dismissing = dismissStr;
      } catch (err) {
        console.error("addEnd error:", err);
        alert("حصل خطأ أثناء تسجيل الانصراف");
      }
    },

    // حذف سجل واحد
    async deleteItem(item) {
      try {
        if (!confirm("متأكد؟ سيتم حذف السجل؟")) return;
        await deleteDoc(doc(db, "workDays", item.id));
        this.workDays = this.workDays.filter((d) => d.id !== item.id);
      } catch (err) {
        console.error("deleteItem error:", err);
      }
    },

    // حذف كل السجلات
    async deleteAll() {
      try {
        if (!confirm("متأكد؟ سيتم حذف كل السجلات نهائيًا")) return;
        const q = await getDocs(collection(db, "workDays"));
        const ops = [];
        q.forEach((d) => ops.push(deleteDoc(doc(db, "workDays", d.id))));
        await Promise.all(ops);
        this.workDays = [];
      } catch (err) {
        console.error("deleteAll error:", err);
      }
    },

    logout() {
      localStorage.removeItem("loggedIn");
      localStorage.removeItem("userId");
      localStorage.removeItem("username");
      this.$router.push("/login");
    },

    // تحويل أي تمثيل وقت مقبول إلى دقائق منذ منتصف الليل
    // يتعامل مع: "6" => 6:00 ، "6.3" => 6:03 (افتراض المستخدم السابق)، "6.30" => 6:30 ، "06:30" => 6:30
    timeStringToMinutes(str) {
      if (str === null || str === undefined) return null;
      const s = String(str).trim();
      if (s.length === 0) return null;

      // استبدال ":" بـ "."
      const safe = s.replace(":", ".").replace(",", ".").trim();

      // إذا كان فيه نقطة عشرية زي 11.342... ناخد أول جزئين للجزء العشري كدقائق
      const parts = safe.split(".");
      const hh = Number(parts[0]) || 0;
      let mm = 0;
      if (parts.length > 1) {
        // نأخذ أول حرفين من الجزء الثاني كدقائق (مثلاً "5" -> 5، "30" -> 30، "1999..." -> 19 )
        const raw = String(parts[1]).slice(0, 2);
        mm = Number(raw) || 0;
      }
      // حماية: لو دخل مينيتس أكبر من 59، نحتسبه كنقاط دقائق عادية (مثلاً 90 دقيقة = 1 ساعة 30 دقيقة)
      return hh * 60 + mm;
    },

    // حساب فرق الدقائق بين بداية ونهاية
    calcMinutes(audience, dismissing) {
      const start = this.timeStringToMinutes(audience);
      const end = this.timeStringToMinutes(dismissing);
      if (start === null || end === null) return null;

      let diff = end - start;

      // حالة نفس الوقت (مثال 6 -> 6) نعتبر 12 ساعة كما طلبت
      if (diff === 0) diff = 12 * 60;
      // لو فرق سالب (مررنا منتصف الليل) نضيف 24 ساعة
      if (diff < 0) diff += 24 * 60;

      return diff;
    },

    // تحويل دقائق لعرض "H:MM"
    formatMinutesAsHMM(minutes) {
      if (minutes === null || minutes === undefined) return "—";
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${h}:${String(m).padStart(2, "0")}`;
    },
  },

  computed: {
    // مجموع الدقائق ثم عرضها كـ "X ساعة Y دقيقة" (مع تحويل الدقائق إلى ساعات)
    totalWorkHoursText() {
      let totalMinutes = 0;
      for (const d of this.workDays) {
        const mins = this.calcMinutes(d.theAudience, d.Dismissing);
        if (mins !== null) totalMinutes += mins;
      }
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `إجمالي العمل: ${h} ساعة و ${m} دقيقة`;
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
.btn {
  cursor: pointer;
}
</style>
