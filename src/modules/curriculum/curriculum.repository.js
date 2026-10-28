import { getPool } from '../../config/db.js';

export async function findCurriculumByCourseId(courseId) {
  const pool = getPool();
  const [modules] = await pool.query(`
    SELECT id, course_id, title, description, display_order, is_published, created_at, updated_at
    FROM course_modules
    WHERE course_id = ?
    ORDER BY display_order ASC, id ASC
  `, [courseId]);

  if (modules.length === 0) {
    return [];
  }

  const moduleIds = modules.map(m => m.id);
  const placeholders = moduleIds.map(() => '?').join(',');

  const [lessons] = await pool.query(`
    SELECT 
      id, module_id, title, description, lesson_type, content_url,
      duration_seconds, is_preview, is_published, display_order, created_at, updated_at
    FROM course_lessons
    WHERE module_id IN (${placeholders})
    ORDER BY display_order ASC, id ASC
  `, moduleIds);

  const lessonsMap = new Map();
  for (const lesson of lessons) {
    if (!lessonsMap.has(lesson.module_id)) {
      lessonsMap.set(lesson.module_id, []);
    }
    lessonsMap.get(lesson.module_id).push({
      id: Number(lesson.id),
      module_id: Number(lesson.module_id),
      title: lesson.title,
      description: lesson.description,
      lesson_type: lesson.lesson_type,
      content_url: lesson.content_url,
      duration_seconds: Number(lesson.duration_seconds || 0),
      is_preview: Boolean(lesson.is_preview),
      is_published: Boolean(lesson.is_published),
      display_order: Number(lesson.display_order || 0),
      created_at: lesson.created_at,
      updated_at: lesson.updated_at,
    });
  }

  return modules.map(m => ({
    id: Number(m.id),
    course_id: Number(m.course_id),
    title: m.title,
    description: m.description,
    display_order: Number(m.display_order || 0),
    is_published: Boolean(m.is_published),
    lessons: lessonsMap.get(m.id) || [],
    created_at: m.created_at,
    updated_at: m.updated_at,
  }));
}

export async function findModuleById(moduleId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT id, course_id, title, description, display_order, is_published, created_at, updated_at
    FROM course_modules
    WHERE id = ?
  `, [moduleId]);

  if (rows.length === 0) return null;
  const m = rows[0];
  return {
    ...m,
    id: Number(m.id),
    course_id: Number(m.course_id),
    display_order: Number(m.display_order),
    is_published: Boolean(m.is_published),
  };
}

export async function createModule(courseId, data) {
  const pool = getPool();
  const [result] = await pool.query(`
    INSERT INTO course_modules (course_id, title, description, display_order, is_published)
    VALUES (?, ?, ?, ?, ?)
  `, [
    courseId,
    data.title,
    data.description || null,
    data.display_order ?? 0,
    data.is_published ? 1 : 0,
  ]);

  return findModuleById(result.insertId);
}

export async function updateModule(moduleId, data) {
  const pool = getPool();
  const fields = [];
  const params = [];

  if (data.title !== undefined) {
    fields.push('title = ?');
    params.push(data.title);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    params.push(data.description);
  }
  if (data.display_order !== undefined) {
    fields.push('display_order = ?');
    params.push(data.display_order);
  }
  if (data.is_published !== undefined) {
    fields.push('is_published = ?');
    params.push(data.is_published ? 1 : 0);
  }

  if (fields.length === 0) {
    return findModuleById(moduleId);
  }

  fields.push('updated_at = NOW()');
  params.push(moduleId);

  await pool.query(`
    UPDATE course_modules
    SET ${fields.join(', ')}
    WHERE id = ?
  `, params);

  return findModuleById(moduleId);
}

export async function deleteModule(moduleId) {
  const pool = getPool();
  // Delete child lessons first, then module
  await pool.query('DELETE FROM course_lessons WHERE module_id = ?', [moduleId]);
  const [result] = await pool.query('DELETE FROM course_modules WHERE id = ?', [moduleId]);
  return result.affectedRows > 0;
}

export async function findLessonById(lessonId) {
  const pool = getPool();
  const [rows] = await pool.query(`
    SELECT 
      cl.id, cl.module_id, cl.title, cl.description, cl.lesson_type, cl.content_url,
      cl.duration_seconds, cl.is_preview, cl.is_published, cl.display_order,
      cl.created_at, cl.updated_at,
      cm.course_id
    FROM course_lessons cl
    JOIN course_modules cm ON cm.id = cl.module_id
    WHERE cl.id = ?
  `, [lessonId]);

  if (rows.length === 0) return null;
  const l = rows[0];
  return {
    ...l,
    id: Number(l.id),
    module_id: Number(l.module_id),
    course_id: Number(l.course_id),
    duration_seconds: Number(l.duration_seconds || 0),
    display_order: Number(l.display_order || 0),
    is_preview: Boolean(l.is_preview),
    is_published: Boolean(l.is_published),
  };
}

export async function createLesson(moduleId, data) {
  const pool = getPool();
  const [result] = await pool.query(`
    INSERT INTO course_lessons (
      module_id, title, description, lesson_type, content_url,
      duration_seconds, is_preview, is_published, display_order
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    moduleId,
    data.title,
    data.description || null,
    data.lesson_type,
    data.content_url || null,
    data.duration_seconds ?? 0,
    data.is_preview ? 1 : 0,
    data.is_published ? 1 : 0,
    data.display_order ?? 0,
  ]);

  return findLessonById(result.insertId);
}

export async function updateLesson(lessonId, data) {
  const pool = getPool();
  const fields = [];
  const params = [];

  if (data.title !== undefined) {
    fields.push('title = ?');
    params.push(data.title);
  }
  if (data.description !== undefined) {
    fields.push('description = ?');
    params.push(data.description);
  }
  if (data.lesson_type !== undefined) {
    fields.push('lesson_type = ?');
    params.push(data.lesson_type);
  }
  if (data.content_url !== undefined) {
    fields.push('content_url = ?');
    params.push(data.content_url);
  }
  if (data.duration_seconds !== undefined) {
    fields.push('duration_seconds = ?');
    params.push(data.duration_seconds);
  }
  if (data.is_preview !== undefined) {
    fields.push('is_preview = ?');
    params.push(data.is_preview ? 1 : 0);
  }
  if (data.is_published !== undefined) {
    fields.push('is_published = ?');
    params.push(data.is_published ? 1 : 0);
  }
  if (data.display_order !== undefined) {
    fields.push('display_order = ?');
    params.push(data.display_order);
  }

  if (fields.length === 0) {
    return findLessonById(lessonId);
  }

  fields.push('updated_at = NOW()');
  params.push(lessonId);

  await pool.query(`
    UPDATE course_lessons
    SET ${fields.join(', ')}
    WHERE id = ?
  `, params);

  return findLessonById(lessonId);
}

export async function deleteLesson(lessonId) {
  const pool = getPool();
  const [result] = await pool.query('DELETE FROM course_lessons WHERE id = ?', [lessonId]);
  return result.affectedRows > 0;
}

export async function reorderCurriculum(courseId, modules) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    for (const mod of modules) {
      await connection.query(`
        UPDATE course_modules
        SET display_order = ?, updated_at = NOW()
        WHERE id = ? AND course_id = ?
      `, [mod.display_order, mod.id, courseId]);

      if (Array.isArray(mod.lessons)) {
        for (const les of mod.lessons) {
          await connection.query(`
            UPDATE course_lessons
            SET display_order = ?, updated_at = NOW()
            WHERE id = ? AND module_id = ?
          `, [les.display_order, les.id, mod.id]);
        }
      }
    }

    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function syncCourseCurriculumCounters(courseId) {
  const pool = getPool();

  const [rows] = await pool.query(`
    SELECT 
      COUNT(DISTINCT cm.id) AS total_modules,
      COUNT(cl.id) AS total_lessons,
      COALESCE(SUM(cl.duration_seconds), 0) AS total_duration_seconds
    FROM course_modules cm
    LEFT JOIN course_lessons cl ON cl.module_id = cm.id
    WHERE cm.course_id = ?
  `, [courseId]);

  const totalModules = Number(rows[0]?.total_modules || 0);
  const totalLessons = Number(rows[0]?.total_lessons || 0);
  const totalDurationSeconds = Number(rows[0]?.total_duration_seconds || 0);
  const durationHours = Number((totalDurationSeconds / 3600).toFixed(2));

  await pool.query(`
    UPDATE courses
    SET 
      total_modules = ?,
      total_lessons = ?,
      duration_hours = ?,
      updated_at = NOW()
    WHERE id = ?
  `, [totalModules, totalLessons, durationHours, courseId]);

  return {
    total_modules: totalModules,
    total_lessons: totalLessons,
    duration_hours: durationHours,
  };
}
