-- CreateTable
CREATE TABLE "music_genres" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "music_genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artists" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "artists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artist_genres" (
    "artist_id" UUID NOT NULL,
    "music_genre_id" UUID NOT NULL,

    CONSTRAINT "artist_genres_pkey" PRIMARY KEY ("artist_id","music_genre_id")
);

-- CreateTable
CREATE TABLE "user_music_genres" (
    "user_id" UUID NOT NULL,
    "music_genre_id" UUID NOT NULL,

    CONSTRAINT "user_music_genres_pkey" PRIMARY KEY ("user_id","music_genre_id")
);

-- CreateTable
CREATE TABLE "user_artists" (
    "user_id" UUID NOT NULL,
    "artist_id" UUID NOT NULL,

    CONSTRAINT "user_artists_pkey" PRIMARY KEY ("user_id","artist_id")
);

-- CreateTable
CREATE TABLE "movie_genres" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "movie_genres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movies" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "movies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movie_genres_link" (
    "movie_id" UUID NOT NULL,
    "movie_genre_id" UUID NOT NULL,

    CONSTRAINT "movie_genres_link_pkey" PRIMARY KEY ("movie_id","movie_genre_id")
);

-- CreateTable
CREATE TABLE "user_movie_genres" (
    "user_id" UUID NOT NULL,
    "movie_genre_id" UUID NOT NULL,

    CONSTRAINT "user_movie_genres_pkey" PRIMARY KEY ("user_id","movie_genre_id")
);

-- CreateTable
CREATE TABLE "user_movies" (
    "user_id" UUID NOT NULL,
    "movie_id" UUID NOT NULL,

    CONSTRAINT "user_movies_pkey" PRIMARY KEY ("user_id","movie_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "music_genres_name_key" ON "music_genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "artists_name_key" ON "artists"("name");

-- CreateIndex
CREATE INDEX "artists_name_idx" ON "artists"("name");

-- CreateIndex
CREATE UNIQUE INDEX "movie_genres_name_key" ON "movie_genres"("name");

-- CreateIndex
CREATE UNIQUE INDEX "movies_title_key" ON "movies"("title");

-- CreateIndex
CREATE INDEX "movies_title_idx" ON "movies"("title");

-- AddForeignKey
ALTER TABLE "artist_genres" ADD CONSTRAINT "artist_genres_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artist_genres" ADD CONSTRAINT "artist_genres_music_genre_id_fkey" FOREIGN KEY ("music_genre_id") REFERENCES "music_genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_music_genres" ADD CONSTRAINT "user_music_genres_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_music_genres" ADD CONSTRAINT "user_music_genres_music_genre_id_fkey" FOREIGN KEY ("music_genre_id") REFERENCES "music_genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_artists" ADD CONSTRAINT "user_artists_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_artists" ADD CONSTRAINT "user_artists_artist_id_fkey" FOREIGN KEY ("artist_id") REFERENCES "artists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_genres_link" ADD CONSTRAINT "movie_genres_link_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movie_genres_link" ADD CONSTRAINT "movie_genres_link_movie_genre_id_fkey" FOREIGN KEY ("movie_genre_id") REFERENCES "movie_genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_movie_genres" ADD CONSTRAINT "user_movie_genres_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_movie_genres" ADD CONSTRAINT "user_movie_genres_movie_genre_id_fkey" FOREIGN KEY ("movie_genre_id") REFERENCES "movie_genres"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_movies" ADD CONSTRAINT "user_movies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_movies" ADD CONSTRAINT "user_movies_movie_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
