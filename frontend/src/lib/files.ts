/** What kind of thing a chosen, dropped or pasted file is: the composer routes by it. */

const MEDIA_EXTENSIONS = /\.(mp3|m4a|wav|ogg|oga|opus|aac|flac|wma|mp4|m4v|mov|mkv|webm|avi|3gp)$/i
// Phones often hand over a HEIC photo with an empty type, so the name counts too.
const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp|heic|heif)$/i

export const isImageFile = (file: File) => /^image\//.test(file.type) || IMAGE_EXTENSIONS.test(file.name)
export const isMediaFile = (file: File) => /^(audio|video)\//.test(file.type) || MEDIA_EXTENSIONS.test(file.name)

/** The marker the reader writes for a word it could not read. */
export const UNREAD_MARK = '[?]'
export const countUnread = (text: string) => text.split(UNREAD_MARK).length - 1
