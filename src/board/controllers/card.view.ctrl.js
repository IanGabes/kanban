(function(angular) {
    'use strict';

    angular.module('gitlabKBApp.board').controller('ViewController',
        [
            '$scope',
            '$http',
            '$stateParams',
            '$state',
            'BoardService',
            '$sce',
            'CommentService',
            'LabelService',
            'UserService',
            'MilestoneService',
            '$modal',
            'host_url',
            'KBStore',
            function($scope, $http, $stateParams, $state, BoardService, $sce, CommentService, LabelService, UserService, MilestoneService, $modal, host_url, store) {
                BoardService.get($stateParams.project_path).then(function(board) {
                    $scope.labels = _.toArray(board.viewLabels);
                    $scope.priorities = board.priorities;
                    MilestoneService.list(board.project.id).then(function(milestones) {
                        $scope.milestones = milestones;
                    });

                    UserService.list(board.project.id).then(function(users) {
                        $scope.options = users;
                    });
                });

                $scope.card_url = host_url + "/";
                $scope.card_properties = {};
                $scope.commentFormData = {};
                $scope.blockedFormData = {};
                $scope.model = {};
                $scope.modal = $modal;
                $scope.todoFormData = {};
                $scope.newCard = {};

                var getCommentHashKey = function() {
                    return $stateParams.project_id + ":card:" + $scope.card.iid + ":comment";
                };

                var getCardHashKey = function() {
                    return $stateParams.project_id + ":card:" + $scope.card.iid;
                };

                BoardService.getCard($stateParams.project_path, $stateParams.issue_id, $state.params.other).then(function(card) {
                    $scope.card = card;

                    CommentService.list(card.project_id, card.id).then(function(data) {
                        $scope.comments = data;
                    });

                    $scope.commentFormData = store.get(getCommentHashKey()) || {};

                    $scope.submitComment = function() {
                        $scope.isSaving = true;

                        CommentService.create(card.project_id, card.id, $scope.commentFormData.comment).then(function(data) {
                            $scope.isSaving = false;
                            $scope.commentFormData = {};
                            $scope.comments.push(data);
                            $scope.discardCommentDraft();
                        });
                    };
                });

                $scope.discardCommentDraft = function() {
                    store.remove(getCommentHashKey());
                    $scope.commentFormData = {};
                };

                $scope.discardCardDraft = function() {
                    store.remove(getCardHashKey());
                };

                $scope.$watch('commentFormData', function(newV, oldV) {
                    if (oldV !== newV) {
                        store.set(getCommentHashKey(), newV);
                    }
                }, true);

                $scope.$watch('newCard', function(newV, oldV) {
                    if (oldV !== newV) {
                        store.set(getCardHashKey(), {
                            title: newV.title,
                            description: newV.description
                        });
                    }
                }, true);

                $scope.submitTodo = function(card) {
                    $scope.isSavingTodo = true;

                    card.todo.push({
                        'checked': false,
                        'body': $scope.todoFormData.body
                    });
                    BoardService.updateCard(card).then(function() {
                        $scope.isSavingTodo = false;
                        $scope.todoFormData = {};
                        $scope.isTodoAdd = true;
                    });
                };

                $scope.remove = function(card) {
                    BoardService.removeCard(card).then(function(result) {
                        $modal.close();
                    });
                };

                $scope.updateTodo = function(card) {
                    $scope.isSavingTodo = true;
                    return BoardService.updateCard(card).then(function() {
                        $scope.isSavingTodo = false;
                    });
                };

                $scope.updateCard = function(card) {
                    $scope.newCard  = {};
                    $scope.isSaving = true;
                    return BoardService.updateCard(card).then(function() {
                        $scope.isSaving = false;
                        $scope.discardCardDraft();
                    });
                };

                $scope.editCard = function(card){
                    var draft = store.get(getCardHashKey());
                    $scope.newCard = _.clone(card);
                    if (draft !== null) {
                        $scope.newCard.title = draft.title;
                        $scope.newCard.description = draft.description;
                    }
                };

                $scope.removeTodo = function(index, card) {
                    $scope.isSavingTodo = true;
                    card.todo.splice(index, 1);
                    return BoardService.updateCard(card).then(function() {
                        $scope.isSavingTodo = false;
                    });
                };
                
                /**
                 * Update card assignee
                 */
                $scope.update = function(card, user) {
                    if (_.isEmpty(card.assignee) || card.assignee.id != user.id) {
                        card.assignee_id = user.id;
                        return BoardService.updateCard(card);
                    } else {
                        card.assignee_id = 0;
                        return BoardService.updateCard(card);
                    }
                };

                $scope.markAsBlocked = function(card, comment) {
                    CommentService.create(card.project_id, card.id, "Marked as **blocked**: " + comment).then(function(data) {
                        $scope.comments.push(data);
                    });

                    return BoardService.updateCard(card);
                };

                $scope.markAsUnBlocked = function(card) {
                    if (card.properties.andon !== 'none') {
                        return;
                    }

                    var comment = 'Marked as **unblocked**';
                    CommentService.create(card.project_id, card.id, comment).then(function(data) {
                        $scope.comments.push(data);
                    });

                    return BoardService.updateCard(card);
                };

                $scope.markAsReady = function (card) {
                    if (card.properties.andon === 'ready') {
                        CommentService.create(card.project_id, card.id, "Marked as **ready** for next stage").then(function(data) {
                            $scope.comments.push(data);
                        });
                    }

                    return BoardService.updateCard(card);
                };

                $scope.updateMilestone = function(card, milestone) {
                    if (_.isEmpty(card.milestone) || (card.milestone.id != milestone.id)) {
                        card.milestone_id = milestone.id;
                        return BoardService.updateCard(card);
                    } else {
                        card.milestone_id = 0;
                        return BoardService.updateCard(card);
                    }
                };

                $scope.updateLabels = function(card, label) {
                    BoardService.get($stateParams.project_path).then(function(board) {
                        if (card.labels.length === card.viewLabels.length) {
                            card.labels.push(_.first(board.labels));
                        }

                        if (card.labels.indexOf(label.name) !== -1) {
                            card.viewLabels.splice(card.viewLabels.indexOf(label), 1);
                            card.labels.splice(card.labels.indexOf(label.name), 1);
                        } else {
                            card.viewLabels.push(label);
                            card.labels.push(label.name);
                        }

                        return BoardService.updateCard(card);
                    });
                };

                $scope.updatePriority = function (card, priority) {
                    var index = card.labels.indexOf(card.priority.name);
                    if (index !== -1) {
                        card.labels.splice(index, 1);
                    }

                    if (_.isEmpty(card.priority.name) || card.priority.name != priority.name) {
                        card.labels.push(priority.name);
                        card.priority = priority;
                    } else {
                        card.priority = LabelService.getPriority(card.project_id, "");
                    }

                    return BoardService.updateCard(card);
                }
            }
        ]
    );
})(window.angular);
