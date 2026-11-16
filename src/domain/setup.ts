import { authFilePath, buildAuthFile, LOCAL_SITE_REPO, type AdminBundle } from '../core/auth/authFile'
import {
  generateKey,
  generatePassword,
  hashLogin,
  normalizeLogin,
  PBKDF2_ITERATIONS,
  type Bytes,
} from '../core/crypto'
import { diskInfo } from '../core/disk'
import { createStore, isLocalRepo, jsonFile, StorageError } from '../core/storage'
import { canWriteToRepo, checkRepoAccess } from '../core/storage/github'
import { paths, type AdminSettings, type KeysFile, type StudentsIndex } from './types'
import { ValidationError } from './students'

export interface SetupInput {
  name: string
  login: string
  dataRepo: string
  siteRepo: string
  adminToken: string
  studentToken: string
  diskToken: string
}

export const LOCAL_SETUP: Pick<SetupInput, 'dataRepo' | 'siteRepo' | 'adminToken' | 'studentToken' | 'diskToken'> = {
  dataRepo: 'local/data',
  siteRepo: LOCAL_SITE_REPO,
  adminToken: 'local',
  studentToken: 'local',
  diskToken: '',
}

const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

export interface SetupResult {
  login: string
  password: string
  key: Bytes
  bundle: AdminBundle
}

/** Первичная установка: создаёт структуру данных и аккаунт репетитора. */
export async function runSetup(raw: SetupInput, onStep: (text: string) => void): Promise<SetupResult> {
  const input = {
    ...raw,
    name: raw.name.trim(),
    login: normalizeLogin(raw.login),
    dataRepo: raw.dataRepo.trim(),
    siteRepo: raw.siteRepo.trim(),
    adminToken: raw.adminToken.trim(),
    studentToken: raw.studentToken.trim(),
    diskToken: raw.diskToken.trim(),
  }
  const local = isLocalRepo(input.dataRepo)

  if (input.name.length < 2) throw new ValidationError('name', 'Введите своё имя')
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(input.login)) {
    throw new ValidationError('login', 'Логин: 3–32 символа, латинские буквы, цифры, точка, дефис, подчёркивание')
  }
  if (!local) {
    if (!REPO_PATTERN.test(input.dataRepo)) throw new ValidationError('dataRepo', 'Формат: логин/репозиторий')
    if (!REPO_PATTERN.test(input.siteRepo)) throw new ValidationError('siteRepo', 'Формат: логин/репозиторий')
    if (input.dataRepo === input.siteRepo) throw new ValidationError('siteRepo', 'Нужны два разных репозитория')
    if (!input.adminToken) throw new ValidationError('adminToken', 'Вставьте токен репетитора')
    if (!input.studentToken) throw new ValidationError('studentToken', 'Вставьте токен учеников')
    if (input.adminToken === input.studentToken) {
      throw new ValidationError('studentToken', 'Токен учеников должен быть отдельным: без доступа к сайту')
    }

    // Ошибку 401 привязываем к конкретному полю: иначе непонятно, какой из токенов вставлен неверно.
    const invalid = ' GitHub не принимает этот токен. Проверьте, что строка github_pat_… вставлена целиком и что токен не был пересоздан (Regenerate) после копирования.'
    const using = async <T>(field: 'adminToken' | 'studentToken', label: string, run: () => Promise<T>): Promise<T> => {
      try {
        return await run()
      } catch (error) {
        if (error instanceof StorageError && error.status === 401) throw new ValidationError(field, label + invalid)
        throw error
      }
    }
    const admin = <T>(run: () => Promise<T>) => using('adminToken', 'Токен репетитора:', run)
    const student = <T>(run: () => Promise<T>) => using('studentToken', 'Токен учеников:', run)

    onStep('Проверяю доступ к репозиториям')
    const data = await admin(() => checkRepoAccess(input.dataRepo, input.adminToken))
    if (!data.isPrivate) throw new ValidationError('dataRepo', 'Репозиторий данных должен быть приватным')
    await admin(() => checkRepoAccess(input.siteRepo, input.adminToken))

    onStep('Проверяю права токенов')
    const hint = ' Откройте токен на GitHub, нажмите Edit и поставьте Contents: Read and write.'
    if (!(await admin(() => canWriteToRepo(input.dataRepo, input.adminToken)))) {
      throw new ValidationError('adminToken', 'Токен репетитора не может писать в репозиторий данных.' + hint)
    }
    if (!(await admin(() => canWriteToRepo(input.siteRepo, input.adminToken)))) {
      throw new ValidationError('adminToken', 'Токен репетитора не может писать в репозиторий сайта.' + hint)
    }
    if (!(await student(() => canWriteToRepo(input.dataRepo, input.studentToken)))) {
      throw new ValidationError('studentToken', 'Токен учеников не может писать в репозиторий данных.' + hint)
    }
    if (await student(() => canWriteToRepo(input.siteRepo, input.studentToken))) {
      throw new ValidationError(
        'studentToken',
        'Токен учеников может писать в репозиторий сайта. Оставьте ему доступ только к репозиторию данных.',
      )
    }
    if (input.diskToken) {
      onStep('Проверяю Яндекс Диск')
      await diskInfo(input.diskToken)
    }
  }

  const dataStore = createStore(input.dataRepo, input.adminToken)
  const siteStore = createStore(input.siteRepo, input.adminToken)

  onStep('Проверяю, что платформа ещё не установлена')
  if (await dataStore.read(paths.students)) {
    throw new Error(
      'В репозитории данных уже есть установленная платформа. Повторная установка стёрла бы ключи шифрования, поэтому она не выполняется.',
    )
  }

  const key = generateKey()
  const password = generatePassword()
  const bundle: AdminBundle = {
    role: 'admin',
    userId: 'admin',
    name: input.name,
    dataRepo: input.dataRepo,
    siteRepo: input.siteRepo,
    githubToken: input.adminToken,
    studentGithubToken: input.studentToken,
    diskToken: input.diskToken,
  }

  onStep('Создаю структуру данных')
  const settings: AdminSettings = { createdAt: new Date().toISOString(), maxUploadMb: 500 }
  await jsonFile<KeysFile>(dataStore, paths.keys, key).save({ keys: {} }, 'Установка: ключи')
  await jsonFile<AdminSettings>(dataStore, paths.settings, key).save(settings, 'Установка: настройки')
  await jsonFile(dataStore, paths.shared.lessons).save({ lessons: [] }, 'Установка: уроки')
  await jsonFile(dataStore, paths.shared.files).save({ files: [] }, 'Установка: файлы')
  await jsonFile(dataStore, paths.shared.useful).save({ items: [] }, 'Установка: полезные материалы')
  await jsonFile(dataStore, paths.shared.methodical).save({ items: [] }, 'Установка: методички')
  await jsonFile(dataStore, paths.shared.examCatalog).save({ versions: [] }, 'Установка: справочник заданий')

  onStep('Создаю аккаунт репетитора')
  const authFile = await buildAuthFile(password, key, bundle, local ? 1000 : PBKDF2_ITERATIONS)
  const path = authFilePath(await hashLogin(input.login))
  const existing = await siteStore.read(path)
  await siteStore.write(path, JSON.stringify(authFile), { sha: existing?.sha, message: 'Установка: вход репетитора' })

  // Индекс учеников пишется последним: его наличие означает, что установка завершена.
  await jsonFile<StudentsIndex>(dataStore, paths.students, key).save({ students: [] }, 'Установка: список учеников')

  return { login: input.login, password, key, bundle }
}
