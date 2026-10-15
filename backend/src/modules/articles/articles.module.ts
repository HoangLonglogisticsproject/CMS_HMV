import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import {
  AdminArticleCategoriesController,
  AdminArticlesController,
} from './admin-articles.controller';
import { ArticlesService } from './articles.service';
import { PublicArticlesController } from './public-articles.controller';

@Module({
  imports: [MediaModule],
  controllers: [
    AdminArticlesController,
    AdminArticleCategoriesController,
    PublicArticlesController,
  ],
  providers: [ArticlesService],
})
export class ArticlesModule {}
