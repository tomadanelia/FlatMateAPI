import { Module } from '@nestjs/common';
import { AlgorithmRegistry } from './algorithm.registry';
import { LifestyleAlgorithm } from './algorithms/lifestyle.algorithm';
import { PersonalityAlgorithm } from './algorithms/personality.algorithm';
import { TasteAlgorithm } from './algorithms/taste.algorithm';
import { MatchingController } from './matching.controller';
import { MatchingService } from './matching.service';
@Module({ controllers: [MatchingController], providers: [MatchingService, AlgorithmRegistry, PersonalityAlgorithm, TasteAlgorithm, LifestyleAlgorithm] })
export class MatchingModule {}
