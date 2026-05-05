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

            <!-- حساب عدد الساعات live -->
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

              <!-- زر التعديل الجديد -->
              <button class="btn btn-warning ms-2" @click="editTimes(item)">
                تعديل
              </button>

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
    formatDisplayTime(timeStr) {
      if (!timeStr && timeStr !== 0) return "";
      const s = String(timeStr).replace(",", ".").replace("：", ".").trim();
      const safe = s.replace(":", ".");
      const parts = safe.split(".");
      let hh = Number(parts[0]) || 0;
      let mm = 0;
      if (parts[1] !== undefined) {
        const minutesPart = String(parts[1]).slice(0, 2);
        mm = Number(minutesPart) || 0;
      }
      const isPM = hh >= 12;
      const displayHour = hh % 12 === 0 ? 12 : hh % 12;
      return `${displayHour}:${String(mm).padStart(2, "0")} ${isPM ? "م" : "ص"}`;
    },

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

    async loadWorkDays() {
      try {
        const userIdStr = localStorage.getItem("userId");
        if (!userIdStr) {
          this.$router.push("/login");
          return;
        }
        const userId = Number(userIdStr);

        const q = query(collection(db, "workDays"), where("userId", "==", userId));
        const snap = await getDocs(q);
        this.workDays = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

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
        const d = String(now.getDate()).padStart(2, '0');
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const y = now.getFullYear();
        const date = `${d}-${m}-${y}`;
        
        const time = `${now.getHours()}.${String(now.getMinutes()).padStart(2, "0")}`;

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
          userId: userId,
        });

        await this.loadWorkDays();
      } catch (err) {
        console.error("addStart error:", err);
        alert("حصل خطأ أثناء تسجيل الحضور");
      }
    },

    async addEnd(item) {
      try {
        if (item.Dismissing) return;
        const now = new Date();
        const dismissStr = `${now.getHours()}.${String(now.getMinutes()).padStart(2, "0")}`;
        await updateDoc(doc(db, "workDays", item.id), { Dismissing: dismissStr });
        item.Dismissing = dismissStr;
      } catch (err) {
        console.error("addEnd error:", err);
        alert("حصل خطأ أثناء تسجيل الانصراف");
      }
    },

    // دالة التعديل الجديدة
    async editTimes(item) {
      const newStart = prompt("تعديل وقت الحضور (مثال 08.30):", item.theAudience);
      if (newStart === null) return;

      const newEnd = prompt("تعديل وقت الانصراف (اتركه فارغاً إذا لم ينصرف):", item.Dismissing || "");
      if (newEnd === null) return;

      try {
        const updatedData = {
          theAudience: newStart.replace(":", "."),
          Dismissing: newEnd.trim() !== "" ? newEnd.replace(":", ".") : null
        };

        await updateDoc(doc(db, "workDays", item.id), updatedData);
        
        // تحديث البيانات في المصفوفة الحالية
        item.theAudience = updatedData.theAudience;
        item.Dismissing = updatedData.Dismissing;
        
        alert("تم التعديل بنجاح ✅");
      } catch (err) {
        console.error("editTimes error:", err);
        alert("حدث خطأ أثناء التعديل");
      }
    },

    async deleteItem(item) {
      try {
        if (!confirm("متأكد؟ سيتم حذف السجل؟")) return;
        await deleteDoc(doc(db, "workDays", item.id));
        this.workDays = this.workDays.filter((d) => d.id !== item.id);
      } catch (err) {
        console.error("deleteItem error:", err);
      }
    },

    async deleteAll() {
      try {
        if (!confirm("متأكد؟ سيتم حذف كل السجلات نهائيًا")) return;
        const q = await getDocs(collection(db, "workDays"));
        const ops = [];
        q.forEach((d) => {
          ops.push(deleteDoc(doc(db, "workDays", d.id)));
        });
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

    timeStringToMinutes(str) {
      if (str === null || str === undefined) return null;
      const s = String(str).trim();
      if (s.length === 0) return null;
      const safe = s.replace(":", ".").replace(",", ".").trim();
      const parts = safe.split(".");
      const hh = Number(parts[0]) || 0;
      let mm = 0;
      if (parts.length > 1) {
        const raw = String(parts[1]).slice(0, 2);
        mm = Number(raw) || 0;
      }
      return hh * 60 + mm;
    },

    calcMinutes(audience, dismissing) {
      const start = this.timeStringToMinutes(audience);
      const end = this.timeStringToMinutes(dismissing);
      if (start === null || end === null) return null;

      let diff = end - start;
      if (diff < 0) diff += 24 * 60; 
      return diff;
    },

    formatMinutesAsHMM(minutes) {
      if (minutes === null || minutes === undefined) return "—";
      const h = Math.floor(minutes / 60);
      const m = minutes % 60;
      return `${h}:${String(m).padStart(2, "0")}`;
    },
  },

  computed: {
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
