"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { recalculateCourseProgress } from "@/lib/courseProgress";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function enrollInCourse(courseId: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data: course } = await admin
    .from("courses")
    .select("id,status,price_bdt,visibility")
    .eq("id", courseId)
    .eq("status", "PUBLISHED")
    .is("deleted_at", null)
    .maybeSingle();

  if (!course) {
    throw new Error("This course is not available for enrollment.");
  }

  if (course.visibility === "PRIVATE") {
    throw new Error("This private course is available by invitation only.");
  }

  if (course.price_bdt !== null && course.price_bdt > 0) {
    throw new Error("This is a paid course. Please submit payment details to enroll.");
  }

  const { count } = await admin
    .from("course_items")
    .select("id", { count: "exact", head: true })
    .eq("course_id", courseId)
    .eq("is_required", true);

  await admin.from("course_enrollments").upsert({
    user_id: user.id,
    course_id: courseId,
    status: "ACTIVE",
  }, { onConflict: "user_id,course_id" });

  await admin.from("course_progress").upsert({
    user_id: user.id,
    course_id: courseId,
    total_items: count ?? 0,
    completed_items: 0,
    progress_percent: 0,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,course_id" });

  // Fetch sections and items, sort them globally, and get the first item
  const [{ data: sections }, { data: items }] = await Promise.all([
    admin.from("course_sections").select("id").eq("course_id", courseId).order("position", { ascending: true }),
    admin.from("course_items").select("id, section_id, position, bypass_sequential_unlock").eq("course_id", courseId)
  ]);

  const rawItems = items ?? [];
  const sectionsList = sections ?? [];
  const orderedItems: typeof rawItems = [];
  for (const sec of sectionsList) {
    const secItems = rawItems
      .filter((item) => item.section_id === sec.id)
      .sort((a, b) => a.position - b.position);
    orderedItems.push(...secItems);
  }
  const unsectionedItems = rawItems
    .filter((item) => !item.section_id)
    .sort((a, b) => a.position - b.position);
  orderedItems.push(...unsectionedItems);

  const firstItem = orderedItems[0] ?? null;

  if (firstItem) {
    const { data: existingProgress } = await admin
      .from("course_item_progress")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_item_id", firstItem.id)
      .maybeSingle();

    if (!existingProgress) {
      await admin.from("course_item_progress").insert({
        user_id: user.id,
        course_id: courseId,
        course_item_id: firstItem.id,
        completed: false,
        updated_at: new Date().toISOString(),
      });
    }
  }

  revalidatePath("/account");
  revalidatePath("/courses");
  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}`);
}

export async function markCourseItemComplete(courseId: string, itemId: string) {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data: enrollment } = await admin
    .from("course_enrollments")
    .select("id,status")
    .eq("user_id", user.id)
    .eq("course_id", courseId)
    .maybeSingle();

  if (!enrollment || enrollment.status === "CANCELLED") {
    throw new Error("You need to enroll before saving course progress.");
  }

  // Enforce sequential completion: the preceding item must be completed first
  const [{ data: cSections }, { data: cItems }] = await Promise.all([
    admin.from("course_sections").select("id").eq("course_id", courseId).order("position", { ascending: true }),
    admin.from("course_items").select("id, section_id, position").eq("course_id", courseId)
  ]);

  const rawCItems = cItems ?? [];
  const cSectionsList = cSections ?? [];
  const orderedCItems: typeof rawCItems = [];
  for (const sec of cSectionsList) {
    const secItems = rawCItems
      .filter((item) => item.section_id === sec.id)
      .sort((a, b) => a.position - b.position);
    orderedCItems.push(...secItems);
  }
  const unsectionedCItems = rawCItems
    .filter((item) => !item.section_id)
    .sort((a, b) => a.position - b.position);
  orderedCItems.push(...unsectionedCItems);

  const orderedIds = orderedCItems.map((i) => i.id);
  const currentIdx = orderedIds.indexOf(itemId);

  const currentItem = (currentIdx >= 0 ? orderedCItems[currentIdx] : null) as (typeof orderedCItems[number] & { bypass_sequential_unlock?: boolean | null }) | null;
  if (!currentItem) {
    throw new Error("This course item is not part of the course.");
  }

  if (currentIdx > 0 && !currentItem.bypass_sequential_unlock) {
    const prevItemId = orderedIds[currentIdx - 1];
    const { data: prevProgress } = await admin
      .from("course_item_progress")
      .select("completed")
      .eq("user_id", user.id)
      .eq("course_item_id", prevItemId)
      .maybeSingle();

    if (!prevProgress?.completed) {
      throw new Error("You must complete the previous item first.");
    }
  }

  await admin.from("course_item_progress").upsert({
    user_id: user.id,
    course_id: courseId,
    course_item_id: itemId,
    completed: true,
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,course_item_id" });

  // Automatically mark the next lesson as In Progress (completed: false)
  if (currentIdx !== -1 && currentIdx < orderedIds.length - 1) {
    const nextItemId = orderedIds[currentIdx + 1];
    const { data: existingNextProgress } = await admin
      .from("course_item_progress")
      .select("id")
      .eq("user_id", user.id)
      .eq("course_item_id", nextItemId)
      .maybeSingle();

    if (!existingNextProgress) {
      await admin.from("course_item_progress").insert({
        user_id: user.id,
        course_id: courseId,
        course_item_id: nextItemId,
        completed: false,
        updated_at: new Date().toISOString(),
      });
    }
  }

  await recalculateCourseProgress(user.id, courseId, itemId);

  revalidatePath("/account");
  revalidatePath(`/courses/${courseId}`);
}

export async function submitCourseOrder(
  courseId: string,
  formData: FormData,
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { user } = await requireUser();
    const admin = createAdminClient();

    const { data: course } = await admin
      .from("courses")
      .select("id,status,price_bdt")
      .eq("id", courseId)
      .eq("status", "PUBLISHED")
      .is("deleted_at", null)
      .maybeSingle();

    if (!course || course.price_bdt === null || course.price_bdt <= 0) {
      return { success: false, error: "This course is not available for purchase." };
    }

    const paymentMethod = formData.get("paymentMethod") as "BKASH" | "NAGAD" | "BANK_TRANSFER" | "OTHER";
    const transactionId = String(formData.get("transactionId") || "").trim() || null;
    const senderNumber = String(formData.get("senderNumber") || "").trim() || null;
    const note = String(formData.get("note") || "").trim() || null;

    if (!paymentMethod || !transactionId || !senderNumber) {
      return { success: false, error: "Add a payment method, sender number, and transaction ID." };
    }

    const [{ data: enrollment }, { data: openOrder }, { data: matchingTransaction }] = await Promise.all([
      admin
        .from("course_enrollments")
        .select("id,status")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .maybeSingle(),
      admin
        .from("course_orders")
        .select("id,status")
        .eq("user_id", user.id)
        .eq("course_id", courseId)
        .in("status", ["PENDING", "CONFIRMED"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("course_orders")
        .select("id,user_id,status")
        .eq("transaction_id", transactionId)
        .in("status", ["PENDING", "CONFIRMED"])
        .limit(1)
        .maybeSingle(),
    ]);

    if (enrollment?.status === "ACTIVE" || enrollment?.status === "COMPLETED" || openOrder?.status === "CONFIRMED") {
      return { success: false, error: "You are already enrolled in this course." };
    }
    if (openOrder?.status === "PENDING") {
      return { success: false, error: "Your payment is already under review. Please wait for a decision." };
    }
    if (matchingTransaction && matchingTransaction.user_id !== user.id) {
      return { success: false, error: "That transaction ID is already being used for another order." };
    }

    const file = formData.get("receiptFile");
    let receiptPath: string | null = null;

    if (file instanceof File && file.size > 0) {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${Date.now()}-receipt.${ext}`;
      const arrayBuffer = await file.arrayBuffer();
      const buffer = new Uint8Array(arrayBuffer);

      const supabase = await createClient();
      const { error: uploadError } = await supabase.storage
        .from("payment-receipts")
        .upload(path, buffer, {
          upsert: true,
          contentType: file.type || "image/jpeg",
        });

      if (uploadError) {
        return { success: false, error: `Receipt upload failed: ${uploadError.message}` };
      }
      receiptPath = path;
    }

    const { error } = await admin.from("course_orders").insert({
      user_id: user.id,
      course_id: courseId,
      amount_bdt: course.price_bdt,
      payment_method: paymentMethod,
      transaction_id: transactionId,
      sender_number: senderNumber,
      receipt_path: receiptPath,
      note: note,
      status: "PENDING"
    });

    if (error) {
      if (receiptPath) await admin.storage.from("payment-receipts").remove([receiptPath]);
      return { success: false, error: `Could not submit payment details: ${error.message}` };
    }

    revalidatePath(`/courses/${courseId}`);
    revalidatePath("/courses");
    revalidatePath("/account");
    return { success: true };
  } catch (error) {
    console.error("submitCourseOrder failed", error);
    return { success: false, error: error instanceof Error ? error.message : "Could not submit payment details." };
  }
}
